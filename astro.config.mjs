// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightChangelogs, {
  makeChangelogsSidebarLinks,
} from "starlight-changelogs";
// import starlightLinksValidator from "starlight-links-validator";
import markdownIntegration from "@astropub/md";
import remarkDirective from "remark-directive";
import astroStarlightRemarkAsides from "astro-starlight-remark-asides";
import fs from "node:fs";

import cloudflare from "@astrojs/cloudflare";

const grammar = JSON.parse(
  fs.readFileSync("./src/assets/corn.tmLanguage.json", "utf8"),
);

const corn = {
  name: "corn",
  scopeName: "source.corn",
  patterns: [],
  id: "corn",

  displayName: "Corn",
  path: "",
  ...grammar,
};

// https://astro.build/config
export default defineConfig({
  site: "https://ironb.ar",
  integrations: [
    markdownIntegration(),
    starlight({
      plugins: [
        // starlightLinksValidator(),
        // starlightVersions({ versions: [{ slug: "0.19.0" }] }),
        starlightChangelogs(),
      ],
      routeMiddleware: "./src/routeMiddleware.ts",
      title: "Ironbar",
      description:
        "Documentation site for Ironbar - a GTK4 bar for Wayland compositors",
      credits: true,
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jakestanger/ironbar",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/jakestanger/ironbar/edit/master",
      },
      components: {
        Banner: "./src/overrides/Banner.astro",
        ThemeSelect: "./src/overrides/ThemeSelect.astro",
      },
      sidebar: [
        {
          label: "Version history",
          items: [
            ...makeChangelogsSidebarLinks([
              {
                type: "recent",
                base: "changelog",
                count: 5,
              },
            ]),
          ],
        },
      ],
      tableOfContents: { maxHeadingLevel: 4 },
      expressiveCode: {
        shiki: {
          langs: [corn],
        },
      },
      customCss: ["./src/styles/global.css"],
    }),
  ],

  markdown: {
    remarkPlugins: [remarkDirective, astroStarlightRemarkAsides],
    shikiConfig: {
      langs: [corn],
    },
  },

  adapter: cloudflare({ imageService: "compile" }),
});
