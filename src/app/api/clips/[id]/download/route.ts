import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "node:fs";

// GET /api/clips/:id/download -> descarga el archivo mp4 real del clip generado.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const clip = await prisma.clip.findUnique({ where: { id } });

  if (!clip || !clip.filePath || !fs.existsSync(clip.filePath)) {
    return NextResponse.json({ error: "Clip no encontrado o aún no generado" }, { status: 404 });
  }

  const buffer = fs.readFileSync(clip.filePath);
  const safeName = clip.title.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60) || "clip";

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${safeName}.mp4"`,
    },
  });
}
