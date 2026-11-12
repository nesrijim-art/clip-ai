import { prisma } from "@/lib/prisma";
import { renderClip, SubtitleCue } from "@/lib/ffmpeg";
import { clipPathFor, thumbnailPathFor } from "@/lib/storage";
import type { ClipFormat } from "@prisma/client";

/**
 * Genera (o regenera) el clip real de un candidato ya detectado: recorta,
 * reencuadra, quema subtítulos y exporta con FFmpeg. Se usa tanto desde el
 * botón "Generar clip" como desde el procesamiento automático del modo en vivo.
 */
export async function generateClipForCandidate(
  projectId: string,
  candidateId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { segments: { orderBy: { startSec: "asc" } } },
  });
  if (!project) return { ok: false, error: "Proyecto no encontrado" };
  if (!project.originalPath) return { ok: false, error: "El proyecto no tiene video original" };

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.projectId !== projectId) {
    return { ok: false, error: "Candidato no encontrado" };
  }

  // Pequeño margen de seguridad al inicio y al final para no cortar sílabas
  // justo en el borde de la primera/última palabra, sin pasarnos de los
  // límites reales del video original.
  const PAD_SEC = 0.3;
  const paddedStart = Math.max(0, candidate.startSec - PAD_SEC);
  const paddedEnd =
    project.durationSec != null
      ? Math.min(project.durationSec, candidate.endSec + PAD_SEC)
      : candidate.endSec + PAD_SEC;

  const cues: SubtitleCue[] = project.segments
    .filter((s) => s.endSec > paddedStart && s.startSec < paddedEnd)
    .map((s) => ({
      startSec: Math.max(s.startSec, paddedStart) - paddedStart,
      endSec: Math.min(s.endSec, paddedEnd) - paddedStart,
      text: s.text,
    }));

  const existingClip = await prisma.clip.findUnique({ where: { candidateId } });

  const clip = existingClip
    ? await prisma.clip.update({
        where: { id: existingClip.id },
        data: { status: "GENERATING", errorMessage: null, startSec: paddedStart, endSec: paddedEnd },
      })
    : await (async () => {
        const created = await prisma.clip.create({
          data: {
            projectId,
            candidateId,
            title: candidate.suggestedTitle || `Clip ${candidate.startSec.toFixed(0)}s`,
            description: candidate.suggestedDescription,
            hashtags: candidate.suggestedHashtags,
            reason: candidate.reason,
            score: candidate.score,
            startSec: paddedStart,
            endSec: paddedEnd,
            format: project.format,
            status: "GENERATING",
          },
        });
        return prisma.clip.update({
          where: { id: created.id },
          data: {
            filePath: clipPathFor(projectId, created.id),
            thumbnailPath: thumbnailPathFor(projectId, created.id),
          },
        });
      })();

  await prisma.candidate.update({ where: { id: candidateId }, data: { status: "GENERATING" } });

  try {
    await renderClip({
      inputPath: project.originalPath,
      outputPath: clip.filePath!,
      thumbnailPath: clip.thumbnailPath!,
      startSec: paddedStart,
      endSec: paddedEnd,
      format: project.format as ClipFormat,
      subtitleCues: cues,
      subtitleStyle: project.subtitleStyle,
    });

    await prisma.clip.update({
      where: { id: clip.id },
      data: { status: "READY", subtitlesJson: JSON.stringify(cues), errorMessage: null },
    });
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "READY" } });
    await prisma.project.update({ where: { id: projectId }, data: { status: "CLIPS_READY" } });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al generar el clip";
    await prisma.clip.update({
      where: { id: clip.id },
      data: { status: "ERROR", errorMessage: message },
    });
    await prisma.candidate.update({ where: { id: candidateId }, data: { status: "ERROR" } });
    return { ok: false, error: message };
  }
}
