import { defineCollection } from "astro:content";
import { docsSchema } from "@astrojs/starlight/schema";
import { changelogsLoader } from "starlight-changelogs/loader";
import type { Loader, LoaderContext } from "astro/loaders";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { processMarkdown2 } from "./markdown.ts";
import { aliases, type Schema, type Type } from "./schema.ts";
import type { DataEntry } from "astro/content/config";
import type { ContentEntryType } from "astro";
import { pathToFileURL } from "node:url";
import path from "node:path";

interface FilesRequest {
  owner: string;
  name: string;
  object: string;
}

interface TagsRequest {
  owner: string;
  name: string;
  top: number;
}

interface GraphQlResponse<T> {
  errors?: GraphQlError[];
  data: T;
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

interface GithubRefs {
  nodes: {
    name: string;
  }[];
}

const ignoredFiles = ["docs/_Sidebar.md"];

function isFile(obj: GitHubFile | GitHubDirectory): obj is GitHubFile {
  return !!(obj as GitHubFile).id;
}

async function getFilesRecursive(
  directory: GitHubDirectory,
  version: string,
  context: LoaderContext,
) {
  for (const obj of directory.entries) {
    if (isFile(obj.object)) {
      if (!obj.name.endsWith(".md")) continue;
      if (ignoredFiles.includes(obj.path)) continue;

      if (version !== "master") obj.path = `${version}/${obj.path}`;

      const id = obj.path
        .toLowerCase()
        .replace("docs/", "")
        .replace("home", "index")
        .replace(".md", "")
        .replaceAll(" ", "-");

      const title = obj.name.replace(".md", "");

      let typeName = `${title}Module` as Type;
      if (typeName in aliases)
        typeName = aliases[typeName as keyof typeof aliases];

      const mdString = processMarkdown2(obj.object.text, title, typeName);

      const filePath = path.join(".astro", "collections", obj.path + "x");

      const digest = context.generateDigest({
        id,
        filePath,
        body: mdString,
      });

      // cache file in project `cache` folder
      // as mdx requires deferred rendering
      mkdirSync(path.dirname(filePath), { recursive: true });
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
      parsedData.version = version;

      if (version !== "master") {
        parsedData.pagefind = false;
        parsedData.editUrl = false;
      }

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
    } else await getFilesRecursive(obj.object, version, context);
  }
}

async function getGraphqlData<TReq, TRes>(
  context: LoaderContext,
  queryFile: string,
  variables: TReq,
): Promise<TRes> {
  const ENDPOINT = "https://api.github.com/graphql";

  if (!import.meta.env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN");
  }

  const query = readFileSync(`src/assets/${queryFile}.graphql`, "utf-8");

  const data: GraphQlResponse<TRes> = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${import.meta.env.GITHUB_TOKEN}`,
    },
    body: JSON.stringify({
      query,
      variables,
    }),
  }).then((r) => r.json());

  if (data.errors) {
    for (const error of data.errors) context.logger.error(error.message);
  }

  return data.data;
}

async function getVersions(context: LoaderContext): Promise<string[]> {
  const versions = await getGraphqlData<
    TagsRequest,
    { repository: { refs: GithubRefs } }
  >(context, "tags", {
    owner: "JakeStanger",
    name: "ironbar",
    top: 5,
  }).then((r) => r.repository.refs.nodes.map((n) => n.name));

  // latest first
  versions.reverse();

  return ["master", ...versions];
}

function ironbarDocsLoader(): Loader {
  if (!import.meta.env.GITHUB_TOKEN) {
    throw new Error("Missing GITHUB_TOKEN");
  }

  return {
    name: "ironbar-docs-loader",
    load: async (context) => {
      const versions = await getVersions(context);

      for (const version of versions) {
        // TODO: remove once merged
        let reqVersion = version === "master" ? "docs/starlight" : version;

        const data = await getGraphqlData<
          FilesRequest,
          { repository: { object: GitHubDirectory } }
        >(context, "files", {
          owner: "JakeStanger",
          name: "ironbar",
          object: `${reqVersion}:docs`,
        });

        await getFilesRecursive(data.repository.object, version, context);
      }
    },
  };
}

function schemaLoader(): Loader {
  return {
    name: "ironbar-schema-loader",
    load: async (context) => {
      const versions = await getVersions(context);

      context.logger.info(`Got versions: [${versions.join(", ")}]`);

      const schemas = await Promise.all(
        versions.map((tag) => {
          const file = tag === "master" ? "schema.json" : `schema-${tag}.json`;
          const url = `https://f.jstanger.dev/github/ironbar/${file}?raw`;

          return fetch(url, {
            headers: { accept: "application/json" },
          }).then<Schema>((r) => r.json()).catch(err => {
            context.logger.error(`Failed to load schema for ${tag}: ${err}`);
            throw err;
          });
        }),
      );

      for (let i = 0; i < versions.length; i++) {
        const schema = schemas[i];
        const version = versions[i];

        context.logger.info(`Loaded schema for ${version}`);

        context.store.set({
          id: version,
          data: {
            schema,
          },
        });
      }
    },
  };
}

export const collections = {
  docs: defineCollection({ loader: ironbarDocsLoader(), schema: docsSchema() }),
  schema: defineCollection({ loader: schemaLoader() }),
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
