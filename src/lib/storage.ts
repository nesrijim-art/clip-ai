import path from "node:path";
import fs from "node:fs";

// Todo el contenido de usuario (videos, clips, miniaturas) vive bajo /data,
// fuera de /src, para no mezclar código con archivos pesados generados.
export const DATA_DIR = path.join(process.cwd(), "data");
export const ORIGINALS_DIR = path.join(DATA_DIR, "originals");
export const CLIPS_DIR = path.join(DATA_DIR, "clips");
export const THUMBNAILS_DIR = path.join(DATA_DIR, "thumbnails");

export function ensureDataDirs() {
  for (const dir of [ORIGINALS_DIR, CLIPS_DIR, THUMBNAILS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function originalPathFor(projectId: string, extension: string) {
  return path.join(ORIGINALS_DIR, `${projectId}${extension}`);
}

export function clipPathFor(projectId: string, clipId: string) {
  return path.join(CLIPS_DIR, projectId, `${clipId}.mp4`);
}

export function thumbnailPathFor(projectId: string, clipId: string) {
  return path.join(THUMBNAILS_DIR, projectId, `${clipId}.jpg`);
}

/** Tamaño de un archivo en bytes, o null si no existe. */
export function fileSizeBytes(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}
