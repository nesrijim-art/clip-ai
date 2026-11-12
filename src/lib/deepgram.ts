// Integración real con Deepgram (https://deepgram.com) para transcribir audio/video
// con marcas de tiempo por palabra. Se usa la API REST directamente (sin SDK extra)
// para no añadir más dependencias de npm en este proyecto.

export interface TranscriptWord {
  word: string;
  startSec: number;
  endSec: number;
}

export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  words: TranscriptWord[];
}

export interface TranscriptionResult {
  segments: TranscriptSegment[];
  durationSec: number;
}

const EXTENSION_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".m4v": "video/x-m4v",
};

export function mimeTypeForExtension(extension: string): string {
  return EXTENSION_MIME[extension.toLowerCase()] ?? "application/octet-stream";
}

export class DeepgramConfigError extends Error {}
export class DeepgramApiError extends Error {}

/**
 * Transcribe un archivo completo (modo video grabado) usando la API de
 * transcripción por lotes de Deepgram. Devuelve segmentos con tiempos
 * reales — nunca texto inventado.
 */
export async function transcribeFile(
  buffer: Buffer,
  mimeType: string,
  language: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new DeepgramConfigError(
      "Falta DEEPGRAM_API_KEY en .env.local — no se puede transcribir sin ella."
    );
  }

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
    paragraphs: "true",
    language: language || "es",
  });

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": mimeType,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new DeepgramApiError(
      `Deepgram respondió ${res.status}: ${body.slice(0, 300)}`
    );
  }

  const json = await res.json();
  const channel = json?.results?.channels?.[0];
  const alternative = channel?.alternatives?.[0];
  const utterances: Array<{
    start: number;
    end: number;
    transcript: string;
    words: Array<{ word: string; start: number; end: number }>;
  }> = json?.results?.utterances ?? [];

  const durationSec: number = json?.metadata?.duration ?? 0;

  // Preferimos "utterances" (frases naturales con pausas) como segmentos;
  // si el audio no tiene voz detectable, caemos de vuelta al texto plano.
  let segments: TranscriptSegment[];
  if (utterances.length > 0) {
    segments = utterances.map((u) => ({
      startSec: u.start,
      endSec: u.end,
      text: u.transcript,
      words: u.words.map((w) => ({ word: w.word, startSec: w.start, endSec: w.end })),
    }));
  } else if (alternative?.transcript) {
    const words = (alternative.words ?? []) as Array<{
      word: string;
      start: number;
      end: number;
    }>;
    segments = [
      {
        startSec: 0,
        endSec: durationSec,
        text: alternative.transcript,
        words: words.map((w) => ({ word: w.word, startSec: w.start, endSec: w.end })),
      },
    ];
  } else {
    segments = [];
  }

  return { segments, durationSec };
}
