/// <reference types="vitest/config" />
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The game's version for the title screen, Settings and bug reports: package.json's version
// plus the short git commit (GitHub Actions checks out the commit being deployed).
const version = JSON.parse(readFileSync("package.json", "utf8")).version as string;
let commit = "dev";
try {
  commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
} catch {
  // Not a git checkout: leave "dev".
}

// Served from the root of barangaylegends.fwdp.org (see public/CNAME).
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(commit),
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
