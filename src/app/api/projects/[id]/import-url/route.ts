import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { checkUrl, downloadUrl } from "@/lib/urlImport";
import { ensureDataDirs, originalPathFor } from "@/lib/storage";
import { hasAudioStream } from "@/lib/ffmpeg";

// POST /api/projects/:id/import-url -> valida un enlace pegado por el
// usuario y, si es accesible, lo descarga como video original del proyecto.
// Si no es compatible, explica el motivo y no inventa que funcionó.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const url: string = body.url?.trim();
  if (!url) {
    return NextResponse.json({ error: "Falta el enlace" }, { status: 400 });
  }

  const check = await checkUrl(url);
  if (!check.ok) {
    const reason = (check.reason ?? "").replace(/\.+$/, "");
    return NextResponse.json(
      {
        error: `No se pudo usar este enlace: ${reason}. Puedes subir el archivo de video directamente en su lugar.`,
      },
      { status: 422 }
    );
  }

  ensureDataDirs();
  const outputPath = originalPathFor(id, ".mp4");

  await prisma.project.update({
    where: { id },
    data: { status: "CONNECTING", sourceUrl: url, errorMessage: null },
  });

  try {
    await downloadUrl(url, outputPath);

    if (!(await hasAudioStream(outputPath))) {
      fs.rmSync(outputPath, { force: true });
      const message =
        "El enlace no trae audio (solo se pudo descargar la pista de video). Intenta subir el archivo directamente.";
      await prisma.project.update({
        where: { id },
        data: { status: "ERROR", errorMessage: message },
      });
      return NextResponse.json({ error: message }, { status: 422 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al descargar";
    await prisma.project.update({
      where: { id },
      data: { status: "ERROR", errorMessage: `No se pudo descargar el video: ${message}` },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      status: "CREATED",
      originalPath: outputPath,
      durationSec: check.durationSec ?? null,
      name: project.name === "" || !project.name ? check.title ?? project.name : project.name,
    },
  });

  return NextResponse.json({ project: updated });
}
