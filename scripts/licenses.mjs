import { mkdir, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
await mkdir("public/licenses", { recursive: true });
for (const pkg of ["react", "react-dom", "lucide-react", "@fontsource/geist"]) {
  const dir = join("node_modules", pkg),
    names = await readdir(dir);
  const license = names.find((name) => /^licen[cs]e(?:\.|$)/i.test(name));
  if (!license) throw new Error(`Missing license: ${pkg}`);
  await copyFile(
    join(dir, license),
    join("public/licenses", pkg.replace("/", "_") + ".txt"),
  );
}
