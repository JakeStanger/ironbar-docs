import { defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
// import { docsVersionsLoader } from "starlight-versions/loader";
import { changelogsLoader } from "starlight-changelogs/loader";
import type { Loader, LoaderContext } from "astro/loaders";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { processMarkdown2 } from "./markdown.ts";
import { aliases, type Type } from "./schema.ts";
import type { DataEntry } from "astro/content/config";
import type { ContentEntryType } from "astro";
import { pathToFileURL } from "node:url";

interface GraphQlResponse {
  errors?: GraphQlError[];
  data: { repository: { object: GitHubDirectory } };
}

interface GraphQlError {
  path: string[];
  message: string;
}

interface GitHubObject {
  name: string;
  path: string;
  object: GitHubDirectory | GitHubFile;
}

interface GitHubDirectory {
  entries: GitHubObject[];
}

interface GitHubFile {
  id: string;
  isTruncated: boolean;
  text: string;
}

const ignoredFiles = ["docs/_Sidebar.md"];

function isFile(obj: GitHubFile | GitHubDirectory): obj is GitHubFile {
  return !!(obj as GitHubFile).id;
}

async function getFilesRecursive(
  directory: GitHubDirectory,
  context: LoaderContext,
) {
  for (const obj of directory.entries) {
    if (isFile(obj.object)) {
      if (!obj.name.endsWith(".md")) continue;
      if (ignoredFiles.includes(obj.path)) continue;

      const id = obj.path
        .replace("docs/", "")
        .replace(".md", "")
        .replaceAll(" ", "-")
        .toLowerCase();

      const title = obj.name.replace(".md", "");

      let typeName = `${title}Module` as Type;
      if (typeName in aliases)
        typeName = aliases[typeName as keyof typeof aliases];

      const mdString = processMarkdown2(obj.object.text, title, typeName);

      const filePath = `cache/${obj.path.replaceAll("/", "_")}x`;

      const digest = context.generateDigest({
        id,
        filePath,
        body: mdString,
      });

      // cache file in project `cache` folder
      // as mdx requires deferred rendering
      writeFileSync(filePath, mdString);

      // `entryTypes` is marked internal
      const entryType: ContentEntryType = (
        context as unknown as { entryTypes: Map<string, ContentEntryType> }
      ).entryTypes.get(".mdx")!;

      const { body, data } = await entryType.getEntryInfo({
        contents: mdString,
        fileUrl: pathToFileURL(filePath),
      });

      const parsedData = await context.parseData({ id, filePath, data });

      const dataEntry: DataEntry = {
        id,
        filePath,
        data: parsedData,
        body,
      };

      context.watcher?.add(filePath);

      // async function onChange(path: string) {
      //   const root = fileURLToPath(context.config.root);
      //   path = relative(root, path);
      //
      //   if (!(path.startsWith("cache/") && path.endsWith(".mdx"))) return;
      //
      //   console.log('CHANGE', path);
      // }
      //
      // // TODO: Handle file change events
      // context.watcher?.on('add', onChange);
      // context.watcher?.on('change', onChange);
      // context.watcher?.on('unlink', () => {});

      context.logger.info(id);

      context.store.set({
        ...dataEntry,
        digest,
        deferredRender: true,
      });
    } else await getFilesRecursive(obj.object, context);
  }
}

function ironbarDocsLoader(): Loader {
  const VERSION = "docs/starlight";
  const ENDPOINT = "https://api.github.com/graphql";

  const query = readFileSync("src/assets/query.graphql", "utf-8");

  // recursive prevents failure if exists (`mkdir -p`)
  mkdirSync("cache", { recursive: true });

  return {
    name: "ironbar-docs-loader",
    load: async (context) => {
      const data: GraphQlResponse = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          authorization: `Bearer ${import.meta.env.GITHUB_TOKEN}`,
        },
        body: JSON.stringify({
          query,
          variables: {
            owner: "JakeStanger",
            name: "ironbar",
            object: `${VERSION}:docs`,
          },
        }),
      }).then((r) => r.json());

      if (data.errors) {
        for (const error of data.errors) context.logger.error(error.message);
      }

      await getFilesRecursive(data.data.repository.object, context);
    },
  };
}

export const collections = {
  docs: defineCollection({ loader: ironbarDocsLoader(), schema: docsSchema() }),
  // versions: defineCollection({ loader: docsVersionsLoader() }),
  changelogs: defineCollection({
    loader: changelogsLoader([
      {
        base: "changelog",
        provider: "github",
        owner: "JakeStanger",
        repo: "ironbar",
      },
    ]),
  }),
};
