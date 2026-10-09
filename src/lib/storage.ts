import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

// Fotos de tickets. Con un Blob store conectado (BLOB_READ_WRITE_TOKEN, o BLOB_STORE_ID
// con la credencial OIDC de Vercel) van a Vercel Blob privado; si no, a .uploads/ en local.
const LOCAL_DIR = path.join(process.cwd(), ".uploads");
const blobEnabled = () =>
  Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

export async function saveFile(pathname: string, data: Buffer, contentType: string) {
  if (blobEnabled()) {
    await put(pathname, data, { access: "private", contentType, addRandomSuffix: false });
    return;
  }
  if (process.env.VERCEL) {
    throw new Error("Falta conectar Vercel Blob al proyecto para guardar las fotos.");
  }
  const file = path.join(LOCAL_DIR, pathname);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, data);
}

export async function readFileBytes(pathname: string): Promise<Buffer | null> {
  if (blobEnabled()) {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  const file = path.join(LOCAL_DIR, pathname);
  if (!file.startsWith(LOCAL_DIR + path.sep)) return null;
  try {
    return await readFile(file);
  } catch {
    return null;
  }
}

export async function deleteFiles(pathnames: string[]) {
  if (pathnames.length === 0) return;
  if (blobEnabled()) {
    await del(pathnames);
    return;
  }
  await Promise.all(pathnames.map((p) => rm(path.join(LOCAL_DIR, p), { force: true })));
}
