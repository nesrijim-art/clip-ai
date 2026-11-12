import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeFile, DeepgramConfigError, DeepgramApiError } from "@/lib/deepgram";
import { extractAudio } from "@/lib/ffmpeg";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// POST /api/projects/:id/transcribe -> transcribe el video original con Deepgram
// (real, con tiempos exactos) y guarda los segmentos en la base de datos.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }
  if (!project.originalPath || !fs.existsSync(project.originalPath)) {
    return NextResponse.json(
      { error: "Este proyecto todavía no tiene un video subido" },
      { status: 400 }
    );
  }

  await prisma.project.update({
    where: { id },
    data: { status: "TRANSCRIBING", errorMessage: null },
  });

  const audioPath = path.join(os.tmpdir(), `clipai-audio-${id}-${Date.now()}.mp3`);
  try {
    // Mandamos solo el audio extraído (no el video completo) a Deepgram: sube
    // más rápido, pesa mucho menos y evita formatos de video que Deepgram
    // rechaza. No recorta nada, así que la línea de tiempo no cambia.
    await extractAudio(project.originalPath, audioPath);
    const buffer = await fs.promises.readFile(audioPath);

    const { segments, durationSec } = await transcribeFile(
      buffer,
      "audio/mpeg",
      project.language
    );

    if (segments.length === 0) {
      await prisma.project.update({
        where: { id },
        data: {
          status: "ERROR",
          errorMessage:
            "Deepgram no detectó voz en el archivo. Verifica que el video tenga audio con diálogo.",
        },
      });
      return NextResponse.json(
        { error: "No se detectó voz en el audio" },
        { status: 422 }
      );
    }

    // Reemplazamos cualquier transcripción previa de este proyecto (idempotente).
    await prisma.$transaction([
      prisma.segment.deleteMany({ where: { projectId: id } }),
      prisma.segment.createMany({
        data: segments.map((s) => ({
          projectId: id,
          startSec: s.startSec,
          endSec: s.endSec,
          text: s.text,
          wordsJson: JSON.stringify(s.words),
        })),
      }),
      prisma.project.update({
        where: { id },
        data: { status: "TRANSCRIBED", durationSec, deepgramSecondsUsed: { increment: durationSec } },
      }),
    ]);

    const updated = await prisma.project.findUnique({
      where: { id },
      include: { segments: { orderBy: { startSec: "asc" } } },
    });

    return NextResponse.json({ project: updated });
  } catch (err) {
    const message =
      err instanceof DeepgramConfigError || err instanceof DeepgramApiError
        ? err.message
        : "Error inesperado al transcribir";

    await prisma.project.update({
      where: { id },
      data: { status: "ERROR", errorMessage: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    fs.promises.unlink(audioPath).catch(() => {});
  }
}
