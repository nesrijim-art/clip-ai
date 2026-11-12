import { prisma } from "@/lib/prisma";
import { getDurationSeconds } from "@/lib/ffmpeg";
import { transcribeFile, mimeTypeForExtension } from "@/lib/deepgram";
import { analyzeTranscript } from "@/lib/claude";
import { generateClipForCandidate } from "@/lib/clipGeneration";
import fs from "node:fs";

// Cada cuánto (en segundos de grabación nueva) se vuelve a transcribir.
const TRANSCRIBE_INTERVAL_SEC = 20;
// Cada cuánto se vuelve a analizar con la IA.
const ANALYZE_INTERVAL_SEC = 40;
// Cuánto "colchón" de tiempo se deja sin analizar al final, para no cortar
// una idea a la mitad — se espera a que llegue más contexto.
const CONTEXT_BUFFER_SEC = 8;

function overlapsSignificantly(
  a: { startSec: number; endSec: number },
  b: { startSec: number; endSec: number }
): boolean {
  const overlapStart = Math.max(a.startSec, b.startSec);
  const overlapEnd = Math.min(a.endSec, b.endSec);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const shorter = Math.min(a.endSec - a.startSec, b.endSec - b.startSec);
  return shorter > 0 && overlap / shorter > 0.5;
}

// Procesamiento por proyecto: evita que dos pasadas se pisen si llegan
// fragmentos más rápido de lo que tarda en procesarse el anterior.
//
// Las llamadas normales (disparadas por cada fragmento que sube) se saltan
// si ya hay una pasada en curso — no pasa nada, la siguiente las recoge.
// Las llamadas forzadas (al terminar la grabación) en cambio ESPERAN a que
// termine lo que esté en curso y después, sin falta, hacen su propia pasada
// — así "Terminar" nunca se queda sin procesar lo último por mala suerte.
const runningPasses = new Map<string, Promise<void>>();

export async function processLiveProject(
  projectId: string,
  opts: { force?: boolean } = {}
): Promise<void> {
  const existing = runningPasses.get(projectId);
  if (existing) {
    if (!opts.force) return;
    await existing;
  }

  const run = runOnePass(projectId, opts);
  runningPasses.set(projectId, run);
  try {
    await run;
  } finally {
    if (runningPasses.get(projectId) === run) runningPasses.delete(projectId);
  }
}

/**
 * Una pasada de procesamiento: transcribe lo nuevo, analiza con la IA cuando
 * hay suficiente contexto, y genera automáticamente los clips de los mejores
 * candidatos (hasta la cantidad pedida; el resto queda como candidato alterno).
 */
async function runOnePass(projectId: string, opts: { force?: boolean }): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || !project.originalPath || !fs.existsSync(project.originalPath)) return;

  let duration: number;
  try {
    duration = await getDurationSeconds(project.originalPath);
  } catch {
    return; // el archivo puede estar a medio escribir; se reintenta en la próxima pasada
  }

  // 1. Transcribir lo nuevo (re-transcribimos todo el archivo acumulado y
  // nos quedamos solo con los tramos que empiecen después de lo ya guardado).
  if (opts.force || duration - project.processedSec >= TRANSCRIBE_INTERVAL_SEC) {
    try {
      const buffer = fs.readFileSync(project.originalPath);
      const mimeType = mimeTypeForExtension(".webm");
      const { segments } = await transcribeFile(buffer, mimeType, project.language);
      const newSegments = segments.filter((s) => s.startSec >= project.processedSec - 1);
      if (newSegments.length > 0) {
        await prisma.segment.createMany({
          data: newSegments.map((s) => ({
            projectId,
            startSec: s.startSec,
            endSec: s.endSec,
            text: s.text,
            wordsJson: JSON.stringify(s.words),
          })),
        });
      }
      // Avanzamos "ya procesado" solo hasta donde realmente llegó la última
      // transcripción exitosa (no hasta el final del archivo a ciegas): si
      // Deepgram devolvió menos de lo esperado, la próxima pasada reintenta
      // ese tramo en vez de darlo por perdido para siempre.
      const reachedSec =
        newSegments.length > 0
          ? Math.max(project.processedSec, newSegments[newSegments.length - 1].endSec)
          : project.processedSec;
      await prisma.project.update({
        where: { id: projectId },
        data: {
          processedSec: reachedSec,
          durationSec: duration,
          // Cada pasada re-envía el archivo completo acumulado hasta ahora,
          // así que el consumo real de Deepgram es ~duration por pasada, no
          // solo lo nuevo — lo registramos tal cual para la estimación de costo.
          deepgramSecondsUsed: { increment: duration },
        },
      });
    } catch (err) {
      await prisma.project.update({
        where: { id: projectId },
        data: { errorMessage: `Transcripción en vivo: ${err instanceof Error ? err.message : err}` },
      });
    }
  }

  // 2. Analizar con la IA cuando hay suficiente contexto nuevo.
  const current = await prisma.project.findUnique({
    where: { id: projectId },
    include: { segments: { orderBy: { startSec: "asc" } } },
  });
  if (!current) return;

  const safeCutoff = opts.force ? current.processedSec : current.processedSec - CONTEXT_BUFFER_SEC;

  if (safeCutoff > current.analyzedSec && (opts.force || safeCutoff - current.analyzedSec >= ANALYZE_INTERVAL_SEC)) {
    const segmentsForAnalysis = current.segments.filter((s) => s.endSec <= safeCutoff);
    if (segmentsForAnalysis.length > 0) {
      try {
        const transcriptLines = segmentsForAnalysis
          .map((s) => `[${s.startSec.toFixed(2)}s - ${s.endSec.toFixed(2)}s] ${s.text}`)
          .join("\n");

        const result = await analyzeTranscript({
          transcriptLines,
          durationSec: safeCutoff,
          desiredClipCount: current.desiredClipCount,
          minClipSeconds: current.minClipSeconds,
          maxClipSeconds: current.maxClipSeconds,
          minQualityScore: current.minQualityScore,
          language: current.language,
          priorityTopics: current.priorityTopics,
          excludedTopics: current.excludedTopics,
        });

        const existingCandidates = await prisma.candidate.findMany({ where: { projectId } });

        const freshOnes = result.candidates.filter(
          (c) =>
            c.score >= current.minQualityScore &&
            c.endSec <= safeCutoff + 1 &&
            !existingCandidates.some((ex) => overlapsSignificantly(ex, c))
        );

        for (const c of freshOnes) {
          const candidate = await prisma.candidate.create({
            data: {
              projectId,
              startSec: c.startSec,
              endSec: c.endSec,
              score: c.score,
              category: c.category,
              reason: c.reason,
              suggestedTitle: c.title,
              suggestedDescription: c.description,
              suggestedHashtags: c.hashtags.join(" "),
              status: "DETECTED",
            },
          });

          // Generamos automáticamente solo hasta la cantidad pedida; lo
          // demás queda detectado como alternativa, sin exportarse solo.
          const generatedCount = await prisma.clip.count({
            where: { projectId, status: { in: ["READY", "GENERATING"] } },
          });
          if (generatedCount < current.desiredClipCount) {
            await generateClipForCandidate(projectId, candidate.id);
          }
        }

        await prisma.project.update({
          where: { id: projectId },
          data: {
            analyzedSec: safeCutoff,
            errorMessage: null,
            claudeInputTokens: { increment: result.inputTokens },
            claudeOutputTokens: { increment: result.outputTokens },
          },
        });
      } catch (err) {
        await prisma.project.update({
          where: { id: projectId },
          data: { errorMessage: `Análisis en vivo: ${err instanceof Error ? err.message : err}` },
        });
      }
    }
  }
}
