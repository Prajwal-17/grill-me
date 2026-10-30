import { Resvg } from "@resvg/resvg-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const svg = await readFile(resolve(root, "renderer/public/icon.svg"));
const output = resolve(root, "resources/icons");
await mkdir(output, { recursive: true });

// Export the complete logo as a static image, including its smoke and steak.
// Supply native Linux icon sizes so launchers do not rescale a single bitmap.
for (const size of [16, 24, 32, 48, 64, 96, 128, 256, 512]) {
  const icon = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    font: { loadSystemFonts: false },
  });
  await writeFile(
    resolve(output, `${size}x${size}.png`),
    icon.render().asPng(),
  );
}
console.log("Exported Linux icons from the Grill Me SVG.");
