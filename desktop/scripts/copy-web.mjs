// Copy the built web app (../dist) into desktop/web, which the desktop app
// serves from ssp://app. Run after `vite build`.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, "..", "..", "dist");
const to = join(here, "..", "web");
if (!existsSync(join(from, "index.html"))) {
  console.error("No web build found. Run `npx vite build` in the project root first.");
  process.exit(1);
}
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log("Copied web app into desktop/web");
