import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export async function implementationHash() {
  const hash = createHash("sha256");
  async function walk(path) {
    for (const item of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const name = join(path, item.name);
      if (item.isDirectory()) await walk(name);
      else {
        hash.update(name);
        hash.update(await readFile(name));
      }
    }
  }
  for (const directory of [
    "src",
    "entrypoints",
    "public",
    "tests",
    "scripts",
    "preview",
  ])
    await walk(directory);
  for (const file of [
    "package.json",
    "package-lock.json",
    "wxt.config.ts",
    "tsconfig.json",
    "vitest.config.ts",
    "vite.preview.config.ts",
  ]) {
    hash.update(file);
    hash.update(await readFile(file));
  }
  return hash.digest("hex");
}
