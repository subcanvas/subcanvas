import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// Unit tests for code that needs no browser and no database. The database
// has its own tests (`pnpm db:test`).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
})
