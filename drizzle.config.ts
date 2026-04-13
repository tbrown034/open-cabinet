import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./lib/auth-schema.ts", "./lib/schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || "",
  },
});
