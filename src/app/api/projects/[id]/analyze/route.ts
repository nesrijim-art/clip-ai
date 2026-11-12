import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeTranscript, ClaudeConfigError } from "@/lib/claude";

// POST /api/projects/:id/analyze -> analiza la transcripción ya guardada con
// Claude (real) y crea los candidatos a clip detectados.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { segments: { orderBy: { startSec: "asc" } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }
  if (project.segments.length === 0) {
    return NextResponse.json(
      { error: "Este proyecto todavía no tiene transcripción. Transcríbelo primero." },
      { status: 400 }
    );
  }

  await prisma.project.update({
    where: { id },
    data: { status: "ANALYZING", errorMessage: null },
  });

  try {
    const transcriptLines = project.segments
      .map((s) => `[${s.startSec.toFixed(2)}s - ${s.endSec.toFixed(2)}s] ${s.text}`)
      .join("\n");

    const result = await analyzeTranscript({
      transcriptLines,
      durationSec: project.durationSec ?? project.segments[project.segments.length - 1].endSec,
      desiredClipCount: project.desiredClipCount,
      minClipSeconds: project.minClipSeconds,
      maxClipSeconds: project.maxClipSeconds,
      minQualityScore: project.minQualityScore,
      language: project.language,
      priorityTopics: project.priorityTopics,
      excludedTopics: project.excludedTopics,
    });

    // Filtramos por seguridad lo que el modelo deba respetar igual: puntaje
    // mínimo y que los tiempos tengan sentido dentro del video.
    const videoDuration = project.durationSec ?? Infinity;
    const validCandidates = result.candidates.filter(
      (c) =>
        c.score >= project.minQualityScore &&
        c.startSec >= 0 &&
        c.endSec > c.startSec &&
        c.endSec <= videoDuration + 1
    );

    await prisma.$transaction([
      prisma.candidate.deleteMany({ where: { projectId: id } }),
      ...validCandidates.map((c) =>
        prisma.candidate.create({
          data: {
            projectId: id,
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
        })
      ),
      prisma.project.update({
        where: { id },
        data: {
          status: "ANALYZED",
          errorMessage:
            validCandidates.length === 0
              ? `Sin candidatos de calidad suficiente. ${result.summary}`
              : null,
          claudeInputTokens: { increment: result.inputTokens },
          claudeOutputTokens: { increment: result.outputTokens },
        },
      }),
    ]);

    const updated = await prisma.project.findUnique({
      where: { id },
      include: { candidates: { orderBy: { startSec: "asc" } } },
    });

    return NextResponse.json({ project: updated, summary: result.summary });
  } catch (err) {
    const message =
      err instanceof ClaudeConfigError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Error inesperado al analizar";

    await prisma.project.update({
      where: { id },
      data: { status: "ERROR", errorMessage: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
