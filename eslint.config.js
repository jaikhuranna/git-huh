// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".test-build/*", "src/gen/*"],
  },
  {
    // App code runs on Hermes, where Node built-ins do not exist. Only the
    // test harness may reach for them.
    files: ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message: "Node built-ins are not available in the React Native runtime.",
            },
            {
              // `buffer` is excluded on purpose: the app ships the `buffer`
              // npm polyfill, so `import { Buffer } from 'buffer'` resolves to
              // it and is safe on Hermes.
              group: [
                "assert",
                "child_process",
                "crypto",
                "events",
                "fs",
                "http",
                "https",
                "net",
                "os",
                "path",
                "stream",
                "url",
                "util",
                "worker_threads",
                "zlib",
              ],
              message: "Node built-ins are not available in the React Native runtime.",
            },
          ],
        },
      ],
    },
  },
]);
