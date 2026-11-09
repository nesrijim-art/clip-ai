import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDataDirs, originalPathFor } from "@/lib/storage";
import fs from "node:fs";
import path from "node:path";

// Formatos de video que aceptamos subir directamente.
const ALLOWED_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".m4v"];

// POST /api/projects/:id/upload -> recibe el archivo de video y lo guarda en /data/originals
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
  }

  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json(
      {
        error: `Formato "${extension}" no compatible. Formatos aceptados: ${ALLOWED_EXTENSIONS.join(", ")}`,
      },
      { status: 400 }
    );
  }

  ensureDataDirs();
  const destPath = originalPathFor(project.id, extension);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(destPath, buffer);

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      originalPath: destPath,
      status: "CREATED",
    },
  });

  return NextResponse.json({ project: updated });
}
