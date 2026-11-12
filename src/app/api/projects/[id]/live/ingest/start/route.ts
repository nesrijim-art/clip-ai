import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startIngest, rtmpUrlFor, streamKeyFor, IngestBusyError, RTMP_PORT } from "@/lib/liveIngest";

// POST /api/projects/:id/live/ingest/start -> prepara el servidor de ingesta
// propio (FFmpeg escuchando RTMP) y devuelve los datos de conexión para
// configurar OBS, el teléfono, o cualquier encoder compatible.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  }
  if (project.mode !== "LIVE_STREAM") {
    return NextResponse.json(
      { error: "Este proyecto no es de tipo transmisión en vivo" },
      { status: 400 }
    );
  }

  try {
    await startIngest(id);
  } catch (err) {
    if (err instanceof IngestBusyError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const host = req.headers.get("host")?.split(":")[0] ?? "localhost";
  return NextResponse.json({
    rtmpServer: `rtmp://${host}:${RTMP_PORT}/live`,
    streamKey: streamKeyFor(id),
    fullUrl: rtmpUrlFor(id, host),
  });
}
