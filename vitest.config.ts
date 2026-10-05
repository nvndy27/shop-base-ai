import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@shop/contracts": fileURLToPath(new URL("./packages/contracts/src/index.ts", import.meta.url)),
      "@shop/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url)),
      // The server-only marker deliberately throws outside Next's React server condition.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    testTimeout: 20000,
    hookTimeout: 30000,
    maxWorkers: 2,
  },
});
