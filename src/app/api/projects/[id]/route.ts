import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteProjectFiles, projectStorageBytes } from "@/lib/storage";

// Precios aproximados para estimar el costo — no son una factura real.
// Verifica el precio vigente en tu cuenta de cada proveedor.
const CLAUDE_INPUT_PER_TOKEN = 5 / 1_000_000; // Claude Opus 4.8, USD por token de entrada
const CLAUDE_OUTPUT_PER_TOKEN = 25 / 1_000_000; // USD por token de salida
const DEEPGRAM_PER_SECOND = 0.0043 / 60; // aproximado, verificar en tu cuenta de Deepgram

function estimateCostUsd(p: {
  claudeInputTokens: number;
  claudeOutputTokens: number;
  deepgramSecondsUsed: number;
}): number {
  return (
    p.claudeInputTokens * CLAUDE_INPUT_PER_TOKEN +
    p.claudeOutputTokens * CLAUDE_OUTPUT_PER_TOKEN +
    p.deepgramSecondsUsed * DEEPGRAM_PER_SECOND
  );
}

// GET /api/projects/:id -> detalle completo de un proyecto, con uso de
// almacenamiento y costo estimado (aproximado, no es una factura real)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      candidates: { orderBy: { startSec: "asc" } },
      clips: { orderBy: { createdAt: "asc" } },
      segments: { orderBy: { startSec: "asc" } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const storageBytes = projectStorageBytes(project.originalPath, project.id);
  const estimatedCostUsd = estimateCostUsd(project);

  return NextResponse.json({ project: { ...project, storageBytes, estimatedCostUsd } });
}

// DELETE /api/projects/:id -> borra el proyecto y todos sus archivos
// (original, clips, miniaturas) — no deja nada huérfano en disco.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  deleteProjectFiles(project.originalPath, id);
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
