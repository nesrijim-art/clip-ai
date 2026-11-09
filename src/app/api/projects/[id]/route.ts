import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";

// GET /api/projects/:id -> detalle completo de un proyecto
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
  return NextResponse.json({ project });
}

// DELETE /api/projects/:id -> borra el proyecto y todos sus archivos
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  if (project.originalPath && fs.existsSync(project.originalPath)) {
    fs.rmSync(project.originalPath, { force: true });
  }

  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
