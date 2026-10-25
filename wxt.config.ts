import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifestVersion: 3,
  zip: {
    excludeSources: [
      "test-results/**",
      "release/**",
      "dist-preview/**",
      ".firecrawl/**",
      ".codegraph/**",
    ],
  },
  manifest: ({ browser }) => ({
    name: "Xtrend — Local reading & interaction",
    description:
      "A private, local reading workspace for X. Velocity, page rankings, images, Markdown, repost maps and Grok drafts.",
    permissions: ["storage", "clipboardWrite", "alarms"],
    optional_host_permissions: [
      "https://*/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
    ],
    icons: {
      16: "/icons/16.png",
      32: "/icons/32.png",
      48: "/icons/48.png",
      128: "/icons/128.png",
    },
    action: { default_title: "Xtrend" },
    ...(browser === "firefox"
      ? {
          browser_specific_settings: {
            gecko: {
              id: "xtrend@local.extension",
              strict_min_version: "128.0",
              data_collection_permissions: {
                required: ["none"],
                optional: ["websiteContent"],
              },
            },
          },
        }
      : { minimum_chrome_version: "111" }),
    content_security_policy: {
      extension_pages:
        "script-src 'self'; object-src 'none'; connect-src https: http://localhost:* http://127.0.0.1:*; base-uri 'none'",
    },
  }),
  vite: () => ({ build: { sourcemap: false, assetsInlineLimit: 100000 } }),
});
