import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProjectMode } from "@prisma/client";

// GET /api/projects -> lista todos los proyectos, más nuevos primero
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { clips: true, candidates: true } },
    },
  });
  return NextResponse.json({ projects });
}

// POST /api/projects -> crea un proyecto nuevo con su configuración
export async function POST(req: NextRequest) {
  const body = await req.json();

  const name: string = body.name?.trim() || "Proyecto sin nombre";
  const mode: ProjectMode = body.mode ?? "RECORDED";

  if (!["RECORDED", "LIVE_STREAM", "LIVE_MOBILE"].includes(mode)) {
    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: {
      name,
      mode,
      sourceType: body.sourceType ?? "upload",
      desiredClipCount: body.desiredClipCount ?? 5,
      minClipSeconds: body.minClipSeconds ?? 20,
      maxClipSeconds: body.maxClipSeconds ?? 90,
      language: body.language ?? "es",
      subtitleLanguage: body.subtitleLanguage ?? body.language ?? "es",
      format: body.format ?? "VERTICAL_9_16",
      subtitleStyle: body.subtitleStyle ?? "default",
      priorityTopics: body.priorityTopics ?? null,
      excludedTopics: body.excludedTopics ?? null,
      minQualityScore: body.minQualityScore ?? 50,
    },
  });

  return NextResponse.json({ project }, { status: 201 });
}
