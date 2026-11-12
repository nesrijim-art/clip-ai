import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createZip } from "@/lib/zip";
import fs from "node:fs";

// GET /api/projects/:id/download-all -> descarga todos los clips listos en un .zip
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { clips: { where: { status: "READY" } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }
  if (project.clips.length === 0) {
    return NextResponse.json({ error: "Todavía no hay clips listos" }, { status: 400 });
  }

  const usedNames = new Set<string>();
  const entries = project.clips
    .filter((c) => c.filePath && fs.existsSync(c.filePath))
    .map((c) => {
      let base = (c.title || "clip").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "clip";
      let name = `${base}.mp4`;
      let i = 2;
      while (usedNames.has(name)) {
        name = `${base} (${i}).mp4`;
        i++;
      }
      usedNames.add(name);
      return { name, data: fs.readFileSync(c.filePath!) };
    });

  const zipBuffer = createZip(entries);
  const safeProjectName = project.name.replace(/[^a-zA-Z0-9 _-]/g, "").slice(0, 60) || "clips";

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeProjectName}.zip"`,
    },
  });
}
