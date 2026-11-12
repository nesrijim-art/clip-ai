import { spawn } from "node:child_process";

// Usamos yt-dlp (instalado vía pip) para comprobar si un enlace pegado por
// el usuario es un video accesible y autorizado para descargar — y para
// descargarlo de verdad cuando sí lo es. Si la plataforma lo bloquea
// (contenido privado, con DRM, que requiere inicio de sesión, etc.), yt-dlp
// falla y mostramos el motivo tal cual, en vez de inventar que funcionó.

function runYtDlp(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("python", ["-m", "yt_dlp", ...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("La verificación del enlace tardó demasiado"));
    }, timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

function humanizeError(stderr: string): string {
  const line = stderr
    .split("\n")
    .find((l) => l.includes("ERROR:")) ?? stderr.split("\n")[0] ?? "";
  const cleaned = line.replace(/^ERROR:\s*/, "").trim();

  if (/Unsupported URL/i.test(cleaned)) {
    return "Esta página no es un sitio de video reconocido.";
  }
  if (/Private video|This video is private/i.test(cleaned)) {
    return "El video es privado — no se puede acceder sin iniciar sesión como su dueño.";
  }
  if (/sign in|login required|cookies/i.test(cleaned)) {
    return "Este contenido requiere iniciar sesión, así que no se puede descargar automáticamente.";
  }
  if (/DRM|premium content/i.test(cleaned)) {
    return "Este video está protegido (DRM) y no se puede descargar.";
  }
  if (/This video is unavailable|not available|removed/i.test(cleaned)) {
    return "El video ya no está disponible en esa dirección.";
  }
  if (/HTTP Error 404|404: Not Found/i.test(cleaned)) {
    return "No encontramos un video en ese enlace.";
  }
  if (/HTTP Error 403|Forbidden/i.test(cleaned)) {
    return "No tenemos permiso para acceder a ese enlace.";
  }
  if (/age.?restrict/i.test(cleaned)) {
    return "Este video tiene restricción de edad y no se puede descargar sin iniciar sesión.";
  }

  // Si no reconocemos el error puntual, al menos quitamos el ruido técnico
  // ("[generic] ... (caused by <...>)") para no mostrar algo ilegible.
  const withoutCause = cleaned.replace(/\s*\(caused by.*\)$/i, "");
  const withoutPrefix = withoutCause.replace(/^\[[a-z0-9_]+\]\s*/i, "");
  return withoutPrefix || "No se pudo acceder a este enlace.";
}

export interface UrlCheckResult {
  ok: boolean;
  title?: string;
  durationSec?: number;
  reason?: string;
}

/** Comprueba si un enlace es accesible, sin descargar nada todavía. */
export async function checkUrl(url: string): Promise<UrlCheckResult> {
  try {
    const { stdout, stderr, code } = await runYtDlp(
      ["--dump-json", "--no-playlist", "--simulate", url],
      35000
    );
    if (code !== 0 || !stdout.trim()) {
      return { ok: false, reason: humanizeError(stderr) };
    }
    const info = JSON.parse(stdout.trim().split("\n")[0]);
    return { ok: true, title: info.title, durationSec: info.duration };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "Error inesperado" };
  }
}

/** Descarga de verdad un video ya validado, al archivo indicado. */
export async function downloadUrl(url: string, outputPath: string): Promise<void> {
  // yt-dlp trata "\" como carácter especial en su plantilla de nombre de
  // archivo (-o) y lo descarta en rutas de Windows — usamos "/" solo para
  // este argumento; yt-dlp igual escribe el archivo en la ruta real de
  // Windows (con "\"), así que outputPath en sí no cambia para el resto.
  const { code, stderr } = await runYtDlp(
    [
      "-o",
      outputPath.replace(/\\/g, "/"),
      "--no-playlist",
      // Excluimos HLS (m3u8): son streams fragmentados (a veces variantes
      // "Premium") que a veces fallan al fusionar el audio con el video.
      // Preferimos DASH/progresivo por https, mucho más confiable.
      "--format",
      "bv*[protocol!*=m3u8]+ba[protocol!*=m3u8]/b[protocol!*=m3u8]/bv*+ba/b",
      "--merge-output-format",
      "mp4",
      url,
    ],
    10 * 60 * 1000
  );
  if (code !== 0) {
    throw new Error(humanizeError(stderr));
  }
}
