import { type HeaderDepth, MAX_HEADER_DEPTH } from "./utils.ts";

type ParserMode = "markdown" | "example" | "styling";

interface MarkdownResult {
  markdown: string;
  example: string;
  styling: string;
}

export function processMarkdown(
  markdown: string | undefined,
  depth: HeaderDepth,
): MarkdownResult {
  const result = {
    markdown: "",
    example: "",
    styling: "",
  };

  if (!markdown) return result;

  const lines = markdown.split("\n");

  let mode: ParserMode = "markdown";

  for (let line of lines) {
    if (line === "<br>") continue;

    switch (mode) {
      case "markdown":
        if (line.startsWith("# Example") || line.startsWith("```corn")) {
          mode = "example";
          continue;
        }

        if (line.startsWith("# Styling")) {
          mode = "styling";
          continue;
        }

        // filter out as we get this data elsewhere
        // TODO: Remove these lines from Ironbar doc comments
        if (line.startsWith("**Default**")) continue;
        if (line.startsWith("**Valid options**")) continue;

        if (line.startsWith("#")) {
          const lineParts = line.split(" ");
          const currentDepth = lineParts[0].length;
          if (currentDepth + depth > MAX_HEADER_DEPTH) {
            line = "**" + lineParts.slice(1).join(" ") + "**";
          } else {
            for (let i = 0; i < depth; i++) line = "#" + line;
          }
        }

        result.markdown += line;
        result.markdown += "\n";
        break;
      case "example":
        if (line === "```corn") continue;
        if (line === "```") {
          mode = "markdown";
          continue;
        }

        result.example += line;
        result.example += "\n";
        break;
      case "styling": // for now we assume styling to be the last section
        result.styling += line;
        result.styling += "\n";

        break;
    }
  }

  result.markdown = result.markdown.trim();
  result.example = result.example.trim();
  result.styling = result.styling.trim();

  return result;
}

function header(title: string): string {
  return `
---
title: ${title}
---

import AnchorHeading from '@astrojs/starlight/components/AnchorHeading.astro';
import PropertiesDisplay from "@components/PropertiesDisplay.astro";
import ConfigBlock from "@components/ConfigBlock.astro";
import "astro-starlight-remark-asides/styles.css";
`;
}

function propertiesDisplay(type: string, depth: number): string {
  return `<PropertiesDisplay depth={${depth}} typeName="${type}" />`;
}

function configBlock(corn: string): string {
  corn = JSON.stringify(corn);
  return "<ConfigBlock corn={" + corn + "} />";
}

function heading(depth: number, text: string, id?: string): string {
  if (!id) id = text.toLowerCase().replaceAll(" ", "-");

  return `<AnchorHeading level={${depth}} id="${id}">${text}</AnchorHeading>`;
}

function fixupLinks(markdown: string): string {
  return markdown.replaceAll(/<(http[^>]+)>/g, (_, group) => group);
}

function fixupAlerts(markdown: string): string {
  // map between GH and Starlight alert types
  const ALERT_MAP = {
    NOTE: "note",
    TIP: "tip",
    IMPORTANT: "note[Important]",
    WARNING: "caution",
    CAUTION: "danger",
  };

  const lines = markdown.split("\n");
  const result: string[] = [];

  let matching = false;
  for (const line of lines) {
    if (line.startsWith("> [!")) {
      let alertType = line.replace("> [!", "").replace("]", "");
      alertType = ALERT_MAP[alertType as keyof typeof ALERT_MAP];

      result.push(":::" + alertType);
      matching = true;
    } else if (matching) {
      if (line.startsWith("> ")) result.push(line.replace("> ", " "));
      else {
        result.push(":::");
        result.push("");
        matching = false;
      }
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function hydrateHeaders(markdown: string): string {
  return markdown;

  // TODO: finish - gotta account for code blocks
  // const lines = markdown.split("\n");
  //
  // const result: string[] = [];
  // for (const line of lines) {
  //   if (line.startsWith("#")) {
  //     const depth = line.indexOf(" ");
  //     const text = line.substring(depth + 1);
  //     result.push(heading(depth, text));
  //   } else result.push(line);
  // }
  //
  // return result.join("\n");
}

function hydrateExamples(markdown: string): string {
  const lines = markdown.split("\n");

  const result: string[] = [];
  let cornLines: string[] = [];

  let matching = false;
  for (const line of lines) {
    if (line.includes("```corn")) {
      matching = true;
      continue;
    }

    if (matching && line.trimStart() === "```") {
      result.push(configBlock(cornLines.join("\n")));
      cornLines = [];
      matching = false;
      continue;
    }

    if (matching) cornLines.push(line);
    else result.push(line);
  }

  return result.join("\n");
}

function hydrateProperties(
  typeName: string,
  depth = 2,
): (markdown: string) => string {
  return (markdown: string) =>
    markdown.replace("%{properties}%", propertiesDisplay(typeName, depth));
}

export function processMarkdown2(
  markdown: string,
  title: string,
  typeName: string,
): string {
  const handlers = [
    fixupLinks,
    fixupAlerts,
    hydrateHeaders,
    hydrateProperties(typeName),
    hydrateExamples,
  ];

  return [header(title), handlers.map((func) => func(markdown))].join("\n");
}
