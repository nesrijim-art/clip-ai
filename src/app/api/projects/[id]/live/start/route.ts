import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDataDirs, originalPathFor } from "@/lib/storage";
import fs from "node:fs";

// POST /api/projects/:id/live/start -> marca el proyecto como "grabando" y
// prepara el archivo donde se irán agregando los fragmentos de video.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  ensureDataDirs();
  const originalPath = project.originalPath ?? originalPathFor(id, ".webm");
  if (!fs.existsSync(originalPath)) {
    fs.writeFileSync(originalPath, Buffer.alloc(0));
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      status: "RECORDING",
      isRecording: true,
      originalPath,
      errorMessage: null,
    },
  });

  return NextResponse.json({ project: updated });
}
