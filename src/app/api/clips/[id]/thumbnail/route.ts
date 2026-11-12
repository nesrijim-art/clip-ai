import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";

// GET /api/clips/:id/thumbnail -> sirve la miniatura real generada por ffmpeg para el clip.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clip = await prisma.clip.findUnique({ where: { id } });

  if (!clip || !clip.thumbnailPath || !fs.existsSync(clip.thumbnailPath)) {
    return NextResponse.json({ error: "Miniatura no encontrada" }, { status: 404 });
  }

  const buffer = fs.readFileSync(clip.thumbnailPath);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
