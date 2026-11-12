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

export function clipsDirFor(projectId: string) {
  return path.join(CLIPS_DIR, projectId);
}

export function thumbnailsDirFor(projectId: string) {
  return path.join(THUMBNAILS_DIR, projectId);
}

/** Tamaño de un archivo en bytes, o null si no existe. */
export function fileSizeBytes(filePath: string): number | null {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

function dirSizeBytes(dirPath: string): number {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    total += entry.isDirectory() ? dirSizeBytes(full) : (fileSizeBytes(full) ?? 0);
  }
  return total;
}

/** Espacio real en disco que ocupa un proyecto: original + clips + miniaturas. */
export function projectStorageBytes(originalPath: string | null, projectId: string): number {
  const originalSize = originalPath ? fileSizeBytes(originalPath) ?? 0 : 0;
  return originalSize + dirSizeBytes(clipsDirFor(projectId)) + dirSizeBytes(thumbnailsDirFor(projectId));
}

/** Borra todos los archivos en disco de un proyecto (original, clips, miniaturas). */
export function deleteProjectFiles(originalPath: string | null, projectId: string) {
  if (originalPath && fs.existsSync(originalPath)) {
    fs.rmSync(originalPath, { force: true });
  }
  fs.rmSync(clipsDirFor(projectId), { recursive: true, force: true });
  fs.rmSync(thumbnailsDirFor(projectId), { recursive: true, force: true });
}
