import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST /api/projects/:id/candidates/:candidateId/discard -> descarta un
// candidato (y su clip si existe), guardando el motivo.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; candidateId: string }> }
) {
  const { id, candidateId } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string = body.reason?.trim() || "Descartado manualmente por el usuario";

  const candidate = await prisma.candidate.findUnique({ where: { id: candidateId } });
  if (!candidate || candidate.projectId !== id) {
    return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  }

  const [updatedCandidate] = await prisma.$transaction([
    prisma.candidate.update({
      where: { id: candidateId },
      data: { status: "DISCARDED", discardReason: reason },
    }),
    prisma.clip.updateMany({
      where: { candidateId },
      data: { status: "DISCARDED" },
    }),
  ]);

  return NextResponse.json({ candidate: updatedCandidate });
}
