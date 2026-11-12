import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type ClipFormat = "VERTICAL_9_16" | "SQUARE_1_1" | "HORIZONTAL_16_9";

const FORMAT_DIMENSIONS: Record<ClipFormat, { w: number; h: number }> = {
  VERTICAL_9_16: { w: 1080, h: 1920 },
  SQUARE_1_1: { w: 1080, h: 1080 },
  HORIZONTAL_16_9: { w: 1920, h: 1080 },
};

export interface SubtitleCue {
  startSec: number; // relativo al inicio del clip
  endSec: number;
  text: string;
}

export type SubtitleStyleKey = "default" | "bold-yellow" | "minimal-top";

// Colores en formato ASS: &HAABBGGRR (alfa-azul-verde-rojo, en ese orden).
const SUBTITLE_STYLE_PRESETS: Record<
  SubtitleStyleKey,
  {
    primaryColour: string;
    outlineColour: string;
    backColour: string;
    bold: 0 | 1;
    borderStyle: 1 | 3; // 1 = solo contorno, 3 = caja de fondo
    alignment: 2 | 8; // 2 = abajo-centro, 8 = arriba-centro
    fontScale: number; // multiplicador sobre el tamaño base
  }
> = {
  default: {
    primaryColour: "&H00FFFFFF", // blanco
    outlineColour: "&H00000000", // negro
    backColour: "&H80000000",
    bold: 1,
    borderStyle: 1,
    alignment: 2,
    fontScale: 1,
  },
  "bold-yellow": {
    primaryColour: "&H0000FFFF", // amarillo
    outlineColour: "&H00000000", // negro
    backColour: "&H80000000",
    bold: 1,
    borderStyle: 1,
    alignment: 2,
    fontScale: 1.25,
  },
  "minimal-top": {
    primaryColour: "&H00FFFFFF", // blanco
    outlineColour: "&H00000000",
    backColour: "&HA0000000", // caja semi-transparente
    bold: 0,
    borderStyle: 3,
    alignment: 8,
    fontScale: 0.8,
  },
};

export function resolveSubtitleStyle(key: string | null | undefined): SubtitleStyleKey {
  return key === "bold-yellow" || key === "minimal-top" ? key : "default";
}

function formatAssTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${cs
    .toString()
    .padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  // Las llaves {} son códigos especiales en ASS; los quitamos para evitar
  // que el texto se interprete como una instrucción de estilo.
  return text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
}

/** Genera un archivo de subtítulos .ass con el estilo elegido para el proyecto. */
export function buildAssSubtitleFile(
  cues: SubtitleCue[],
  format: ClipFormat,
  styleKey: SubtitleStyleKey = "default"
): string {
  const { w, h } = FORMAT_DIMENSIONS[format];
  const style = SUBTITLE_STYLE_PRESETS[styleKey];
  const fontSize = Math.round((h / 22) * style.fontScale);
  const marginV = Math.round(h * 0.08);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,${fontSize},${style.primaryColour},${style.outlineColour},${style.backColour},${style.bold},0,${style.borderStyle},3,1,${style.alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const lines = cues
    .filter((c) => c.endSec > c.startSec && c.text.trim().length > 0)
    .map(
      (c) =>
        `Dialogue: 0,${formatAssTime(c.startSec)},${formatAssTime(c.endSec)},Default,,0,0,0,,${escapeAssText(
          c.text
        )}`
    )
    .join("\n");

  return header + lines + "\n";
}

/** Escapa una ruta de Windows para usarla dentro del filtro subtitles= de ffmpeg. */
function escapePathForFilter(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:");
}

/** Duración real de un archivo de video/audio en segundos, usando ffprobe. */
export function getDurationSeconds(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe falló: ${stderr.slice(-500)}`));
      const seconds = parseFloat(stdout.trim());
      if (Number.isNaN(seconds)) return reject(new Error("No se pudo leer la duración"));
      resolve(seconds);
    });
  });
}

/** Comprueba si un archivo tiene al menos una pista de audio, usando ffprobe. */
export function hasAudioStream(filePath: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        filePath,
      ],
      { windowsHide: true }
    );
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe falló: ${stderr.slice(-500)}`));
      resolve(stdout.trim().length > 0);
    });
  });
}

/**
 * Extrae solo la pista de audio de un video a un .mp3 chico y mono, para
 * mandar a Deepgram en vez del video completo: sube más rápido, cuesta lo
 * mismo y evita formatos de video raros que Deepgram rechaza. Conserva la
 * misma línea de tiempo que el video original (no recorta nada).
 */
export function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  return runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    outputPath,
  ]);
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg salió con código ${code}:\n${stderr.slice(-2000)}`));
    });
  });
}

export interface RenderClipOptions {
  inputPath: string;
  outputPath: string;
  thumbnailPath: string;
  startSec: number;
  endSec: number;
  format: ClipFormat;
  subtitleCues: SubtitleCue[];
  subtitleStyle?: string | null;
}

/**
 * Recorta, reencuadra, quema subtítulos y normaliza el audio de un fragmento
 * real del video original. Produce un .mp4 compatible con TikTok/Shorts/Reels.
 */
export async function renderClip(options: RenderClipOptions): Promise<void> {
  const { w, h } = FORMAT_DIMENSIONS[options.format];
  const duration = options.endSec - options.startSec;
  if (duration <= 0) throw new Error("Rango de tiempo inválido para el clip");

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.thumbnailPath), { recursive: true });

  const assPath = path.join(
    os.tmpdir(),
    `clipai-subs-${Date.now()}-${Math.random().toString(36).slice(2)}.ass`
  );
  fs.writeFileSync(
    assPath,
    buildAssSubtitleFile(options.subtitleCues, options.format, resolveSubtitleStyle(options.subtitleStyle)),
    "utf-8"
  );

  try {
    const videoFilter = [
      `scale=${w}:${h}:force_original_aspect_ratio=increase`,
      `crop=${w}:${h}`,
      `subtitles='${escapePathForFilter(assPath)}'`,
    ].join(",");

    await runFfmpeg([
      "-y",
      "-ss",
      options.startSec.toString(),
      "-i",
      options.inputPath,
      "-t",
      duration.toString(),
      "-vf",
      videoFilter,
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      "-movflags",
      "+faststart",
      options.outputPath,
    ]);

    // Miniatura: un fotograma tomado a un tercio del clip.
    await runFfmpeg([
      "-y",
      "-ss",
      (duration / 3).toString(),
      "-i",
      options.outputPath,
      "-frames:v",
      "1",
      options.thumbnailPath,
    ]);
  } finally {
    fs.rmSync(assPath, { force: true });
  }
}
