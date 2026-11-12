import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processLiveProject } from "@/lib/liveProcessor";
import fs from "node:fs";

// POST /api/projects/:id/live/chunk -> recibe un fragmento de video grabado
// (MediaRecorder con timeslice) y lo agrega al archivo que se va construyendo.
// Responde de inmediato; la transcripción/análisis corren después, sin
// bloquear la grabación.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project || !project.originalPath) {
    return NextResponse.json({ error: "Sesión en vivo no iniciada" }, { status: 400 });
  }

  const formData = await req.formData();
  const chunk = formData.get("chunk");
  if (!(chunk instanceof File)) {
    return NextResponse.json({ error: "No se recibió el fragmento" }, { status: 400 });
  }

  const buffer = Buffer.from(await chunk.arrayBuffer());
  fs.appendFileSync(project.originalPath, buffer);

  await prisma.project.update({
    where: { id },
    data: { liveChunkCount: { increment: 1 } },
  });

  // No se espera (await) a propósito: la grabación sigue sin importar cuánto
  // tarde el análisis.
  void processLiveProject(id);

  return NextResponse.json({ ok: true });
}
