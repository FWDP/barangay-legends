// The few Node APIs vite.config.ts uses (to read the version and git commit), declared here so
// the project doesn't need @types/node.
declare module "node:child_process" {
  export function execSync(command: string, options?: { stdio?: unknown[] }): { toString(): string };
}
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
