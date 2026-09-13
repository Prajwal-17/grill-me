import { submissionPath } from "./paths";
import { mkdir, readFile, writeFile, appendFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { AppError } from "../../shared/errors/app-error";
import { uploadsPath } from "../../shared/storage/paths";
const root = uploadsPath;
const idSchema = z.string().uuid();
const locks = new Set<string>();
function directory(owner: string, id: string) {
  return join(root(), idSchema.parse(owner), idSchema.parse(id));
}
export async function beginUpload(owner: string, filename: string) {
  submissionPath(filename);
  const id = crypto.randomUUID();
  const dir = directory(owner, id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "metadata.json"),
    JSON.stringify({ filename, sealed: false }),
  );
  await writeFile(join(dir, "source"), "");
  return { id, offset: 0 };
}
export async function uploadInfo(owner: string, id: string) {
  const dir = directory(owner, id);
  const info = await readFile(join(dir, "metadata.json"), "utf8").catch(() => {
    throw new AppError(
      "UPLOAD_NOT_FOUND",
      "Upload not found. Attach the file again.",
      404,
    );
  });
  return {
    ...(JSON.parse(info) as { filename: string; sealed: boolean }),
    path: join(dir, "source"),
    offset: (await stat(join(dir, "source"))).size,
  };
}
export async function appendUpload(
  owner: string,
  id: string,
  offset: number,
  data: string,
  finish: boolean,
) {
  const key = owner + id;
  if (locks.has(key))
    throw new AppError(
      "UPLOAD_BUSY",
      "An upload chunk is still being saved.",
      409,
      true,
    );
  locks.add(key);
  try {
    const info = await uploadInfo(owner, id);
    if (info.sealed || info.offset !== offset)
      throw new AppError(
        "UPLOAD_OFFSET",
        "Upload position changed. Attach the file again.",
        409,
        true,
      );
    await appendFile(info.path, Buffer.from(data, "base64"));
    if (finish)
      await writeFile(
        join(directory(owner, id), "metadata.json"),
        JSON.stringify({ filename: info.filename, sealed: true }),
      );
    return { id, offset: (await stat(info.path)).size, sealed: finish };
  } finally {
    locks.delete(key);
  }
}
