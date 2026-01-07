import { defineRouteMiddleware } from "@astrojs/starlight/route-data";
import { aliases, type Definition, type Schema, type Type } from "./schema.ts";
import type { APIContext } from "astro";
import { capitalise, getModuleProperties } from "./utils.ts";
import { getCollection, getEntry } from "astro:content";

import type {
  SidebarEntry,
  SidebarGroup,
  SidebarLink,
  // @ts-ignore
} from "@astrojs/starlight/utils/routing/types.ts";

type Tree = { [key: string | symbol]: Tree };
const titleKey = Symbol("title");

async function addTocItems(context: APIContext, version: string, pageId: string) {
  const items = context.locals.starlightRoute.toc?.items;
  if (!items) return;

  const parts = pageId.split("/");

  let typeName = (capitalise(parts[parts.length - 1]) + "Module") as Type;

  if (typeName in aliases) {
    typeName = aliases[typeName as keyof typeof aliases] as Type;
  }

  const schema: Schema = await getEntry(
    "schema",
    version,
  )?.then((res) => res.data.schema);

  const structDef = (schema.$defs[typeName] ?? {
    properties: [],
  }) as Definition;

  const properties = getModuleProperties(schema, structDef);

  const configuration = items.find((i) => i.slug === "configuration");
  if (!configuration) return;

  configuration.children.push(
    ...properties.map((property) => ({
      text: property,
      depth: 2,
      children: [],
      slug: property,
    })),
  );
}

async function addSidebar(context: APIContext, version: string) {
  let docs;
  try {
    docs = await getCollection("docs", (doc => doc.data.version === version));
  } catch {
    console.error("docs catalog not initialized");
    return;
  }

  const tree: Tree = {};
  docs
    .filter(doc => doc.data.title !== "Home")
    .map((doc) => ({ id: doc.id, title: doc.data.title }))
    .forEach(({ id, title }) =>
      id
        .split("/")
        .filter(p => p !== version)
        .reduce(
          (obj, key, i, arr) =>
            (obj[key] =
              obj[key] || (i === arr.length - 1 ? { [titleKey]: title } : {})),
          tree,
        ),
    );

  let currentPath = context.url.pathname;
  if (currentPath.endsWith("/")) {
    currentPath = currentPath.slice(0, currentPath.length - 1);
  }

  const sidebar = context.locals.starlightRoute.sidebar;
  const versionHistory = sidebar.pop();

  for (const node of Object.keys(tree)) {
    addSidebarItem(node, tree[node], sidebar, currentPath);
  }

  if (versionHistory) sidebar.push(versionHistory);
}

function addSidebarItem(
  name: string,
  tree: Tree,
  sidebar: SidebarEntry[],
  currentPath: string,
  path: string[] = [],
) {
  if (!tree) return;
  const isLeafNode = Object.keys(tree).length === 0;

  if (isLeafNode) {
    const href =
      "/" +
      [...path, name]
        .join("/")
        .toLowerCase()
        .replace(/index$/, "");

    const entry: SidebarLink = {
      type: "link",
      label: tree[titleKey],
      href,
      attrs: {},
      isCurrent: href === currentPath, // FIXME: Doesn't work in build
    };

    sidebar.push(entry);
  } else {
    const entry: SidebarGroup = {
      type: "group",
      label: capitalise(name.replace("-", " ")),
      entries: [],
    };

    for (const node of Object.keys(tree)) {
      addSidebarItem(node, tree[node], entry.entries, currentPath, [
        ...path,
        name,
      ]);
    }

    sidebar.push(entry);
  }
}

export const onRequest = defineRouteMiddleware(async (context) => {
  const route = context.locals.starlightRoute;
  const pageId = route.id;

  const parts = context.url.pathname.split("/").filter((p) => p);

  const maybeVersion = parts[0];
  const isPrevVersion = /^v\d/.test(maybeVersion);
  const version = isPrevVersion ? maybeVersion : "master";

  if (pageId.startsWith("modules/")) {
    await addTocItems(context, version, pageId);
  }

  await addSidebar(context, version);

  if (route.editUrl) {
    route.editUrl.pathname = route.editUrl.pathname
      .replace(".astro/collections/", "")
      .slice(0, -1);
  }

  context.locals.version = version;
});
