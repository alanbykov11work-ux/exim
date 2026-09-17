import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const FOLDER_RE = /^[a-z0-9][a-z0-9/_-]{0,119}$/i;

function root() {
  const value = process.env.DOCUMENTS_ROOT;
  if (!value) throw new Error("DOCUMENTS_ROOT is not configured");
  return path.resolve(value);
}

function resolvedStoragePath(storageKey: string) {
  if (!/^[a-f0-9-]{36}$/i.test(storageKey)) throw new Error("invalid storage key");
  return path.join(root(), storageKey.slice(0, 2), storageKey);
}

export async function storeFile(bytes: Buffer) {
  const storageKey = randomUUID();
  const target = resolvedStoragePath(storageKey);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  return {
    storageKey,
    checksum: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function loadFile(storageKey: string) {
  return readFile(resolvedStoragePath(storageKey));
}

export async function deleteFile(storageKey: string) {
  await rm(resolvedStoragePath(storageKey), { force: true });
}

export function safeDownloadName(name: string) {
  return name.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "document";
}

