import { cp, mkdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const dist = resolve(root, "dist");
if (!dist.startsWith(`${root}${sep}`) || dist === root) throw new Error("Unsafe build output path");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all([
  cp(resolve(root, "index.html"), resolve(dist, "index.html")),
  cp(resolve(root, "styles.css"), resolve(dist, "styles.css")),
  cp(resolve(root, "js"), resolve(dist, "js"), { recursive: true }),
  cp(resolve(root, "assets"), resolve(dist, "assets"), {
    recursive: true,
    // PNG sheets are editable source art only. Runtime uses normalized WebP
    // cards/atlases, so omitting all PNG files keeps Pages uploads lean.
    filter: (source) => !source.toLowerCase().endsWith(".png"),
  }),
  cp(resolve(root, "_headers"), resolve(dist, "_headers")),
]);

console.log(`Built static site: ${dist}`);
