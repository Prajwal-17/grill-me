import { Resvg } from "@resvg/resvg-js";
import { readFile, writeFile } from "node:fs/promises";
const svg = await readFile(
  new URL("../../web/public/icon.svg", import.meta.url),
);
// ICNS supports PNG payloads. No iconutil, sips, or other macOS tools needed.
const chunks = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
] as const;
const payloads = chunks.map(([type, size]) => {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } })
    .render()
    .asPng();
  const header = Buffer.alloc(8);
  header.write(type);
  header.writeUInt32BE(png.length + 8, 4);
  return Buffer.concat([header, png]);
});
const header = Buffer.alloc(8);
header.write("icns");
header.writeUInt32BE(8 + payloads.reduce((sum, p) => sum + p.length, 0), 4);
await writeFile(
  new URL("../resources/icon.icns", import.meta.url),
  Buffer.concat([header, ...payloads]),
);
