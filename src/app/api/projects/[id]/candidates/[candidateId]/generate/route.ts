import { NextRequest, NextResponse } from "next/server";
import { generateClipForCandidate } from "@/lib/clipGeneration";
import { prisma } from "@/lib/prisma";

// POST /api/projects/:id/candidates/:candidateId/generate -> recorta, subtitula
// y exporta el clip real con FFmpeg a partir de un candidato ya detectado.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  const { id, candidateId } = await params;
  const result = await generateClipForCandidate(id, candidateId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  const clip = await prisma.clip.findUnique({ where: { candidateId } });
  return NextResponse.json({ clip });
}
