import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stopIngest } from "@/lib/liveIngest";

// POST /api/projects/:id/live/ingest/stop -> corta la transmisión, procesa
// lo último pendiente y conserva la grabación original completa.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  await stopIngest(id);

  const finished = await prisma.project.findUnique({ where: { id } });
  return NextResponse.json({ project: finished });
}
