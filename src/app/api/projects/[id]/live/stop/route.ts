import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processLiveProject } from "@/lib/liveProcessor";

// POST /api/projects/:id/live/stop -> termina la grabación, procesa lo que
// quedó pendiente (forzando una pasada final sin esperar el intervalo normal)
// y deja el proyecto listo para seguir usándose como un video grabado normal.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  await prisma.project.update({
    where: { id },
    data: { isRecording: false, status: "ANALYZING" },
  });

  // Esta sí se espera: el usuario quiere saber cuándo terminó de procesar lo
  // último que quedó pendiente.
  await processLiveProject(id, { force: true });

  const finished = await prisma.project.update({
    where: { id },
    data: { status: "FINISHED" },
  });

  return NextResponse.json({ project: finished });
}
