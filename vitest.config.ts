import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // As cópias de trabalho das sessões paralelas moram dentro do repositório
    // e trazem os próprios testes, que rodariam contra outro node_modules.
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
});
