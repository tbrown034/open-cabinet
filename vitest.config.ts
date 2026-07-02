import { defineConfig } from "vitest/config";
import path from "path";

// Vitest needs the same "@/..." path alias the Next.js app uses, otherwise
// imports like "@/lib/tokens" fail to resolve in tests.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
  },
});
