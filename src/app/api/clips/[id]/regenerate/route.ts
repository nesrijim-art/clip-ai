import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderClip, SubtitleCue } from "@/lib/ffmpeg";
import type { ClipFormat } from "@prisma/client";

// POST /api/clips/:id/regenerate -> vuelve a generar el clip, opcionalmente
// con un recorte distinto (startSec/endSec) y/o subtítulos corregidos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const clip = await prisma.clip.findUnique({
    where: { id },
    include: { project: { include: { segments: { orderBy: { startSec: "asc" } } } } },
  });
  if (!clip) {
    return NextResponse.json({ error: "Clip no encontrado" }, { status: 404 });
  }
  if (!clip.project.originalPath) {
    return NextResponse.json({ error: "El proyecto no tiene video original" }, { status: 400 });
  }

  const startSec: number = body.startSec ?? clip.startSec;
  const endSec: number = body.endSec ?? clip.endSec;
  if (endSec <= startSec) {
    return NextResponse.json({ error: "El fin debe ser mayor que el inicio" }, { status: 400 });
  }
  const boundariesChanged = startSec !== clip.startSec || endSec !== clip.endSec;

  let cues: SubtitleCue[];
  if (Array.isArray(body.subtitleCues)) {
    // El usuario mandó subtítulos explícitos (p. ej. corrigió el texto) — se
    // asume que ya están relativos al nuevo inicio del clip.
    cues = body.subtitleCues;
  } else if (boundariesChanged) {
    // Cambió el recorte sin tocar los subtítulos: hay que recalcular los
    // tiempos desde la transcripción original, o quedarían desincronizados.
    cues = clip.project.segments
      .filter((s) => s.endSec > startSec && s.startSec < endSec)
      .map((s) => ({
        startSec: Math.max(s.startSec, startSec) - startSec,
        endSec: Math.min(s.endSec, endSec) - startSec,
        text: s.text,
      }));
  } else if (clip.subtitlesJson) {
    cues = JSON.parse(clip.subtitlesJson);
  } else {
    cues = [];
  }

  await prisma.clip.update({ where: { id }, data: { status: "GENERATING", errorMessage: null } });
  if (typeof body.subtitleStyle === "string" && body.subtitleStyle !== clip.project.subtitleStyle) {
    await prisma.project.update({
      where: { id: clip.projectId },
      data: { subtitleStyle: body.subtitleStyle },
    });
  }

  try {
    await renderClip({
      inputPath: clip.project.originalPath,
      outputPath: clip.filePath!,
      thumbnailPath: clip.thumbnailPath!,
      startSec,
      endSec,
      format: clip.format as ClipFormat,
      subtitleCues: cues,
      subtitleStyle: body.subtitleStyle ?? clip.project.subtitleStyle,
    });

    const updated = await prisma.clip.update({
      where: { id },
      data: {
        startSec,
        endSec,
        subtitlesJson: JSON.stringify(cues),
        status: "READY",
        errorMessage: null,
      },
    });

    if (clip.candidateId) {
      await prisma.candidate.update({
        where: { id: clip.candidateId },
        data: { startSec, endSec, status: "READY" },
      });
    }

    return NextResponse.json({ clip: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error inesperado al regenerar";
    await prisma.clip.update({ where: { id }, data: { status: "ERROR", errorMessage: message } });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
