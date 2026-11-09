"use client";

import { useEffect, useState } from "react";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/types";

interface Candidate {
  id: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  status: string;
}

interface Clip {
  id: string;
  title: string;
  score: number;
  status: string;
  startSec: number;
  endSec: number;
}

interface Segment {
  id: string;
  startSec: number;
  endSec: number;
  text: string;
}

interface ProjectDetailData {
  id: string;
  name: string;
  mode: keyof typeof MODE_LABELS;
  status: keyof typeof STATUS_LABELS;
  desiredClipCount: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  format: string;
  originalPath: string | null;
  errorMessage: string | null;
  candidates: Candidate[];
  clips: Clip[];
  segments: Segment[];
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const [data, setData] = useState<ProjectDetailData | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (active) setData(json.project);
    }
    load();
    // Por ahora, mientras no haya WebSocket (etapa 4), actualizamos cada 3s
    const interval = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [projectId]);

  if (!data) return <p className="text-neutral-500">Cargando...</p>;

  const readyClips = data.clips.filter((c) => c.status === "READY");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <p className="text-neutral-400">
          {MODE_LABELS[data.mode]} · Estado: <strong>{STATUS_LABELS[data.status]}</strong>
        </p>
        {data.errorMessage && (
          <p className="text-red-400 text-sm mt-1">⚠ {data.errorMessage}</p>
        )}
      </header>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">Progreso</h2>
        <p className="text-sm text-neutral-400">
          Clips listos:{" "}
          <strong>
            {readyClips.length} de {data.desiredClipCount}
          </strong>{" "}
          solicitados · Candidatos detectados: {data.candidates.length}
        </p>
        {!data.originalPath && (
          <p className="text-amber-400 text-sm mt-2">
            Aún no se subió el archivo de video para este proyecto.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">Transcripción</h2>
        {data.segments.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Pendiente — se activa en la Etapa 1 (conectar servicio de transcripción).
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto text-sm">
            {data.segments.map((s) => (
              <p key={s.id}>
                <span className="text-neutral-500">[{formatTime(s.startSec)}]</span>{" "}
                {s.text}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">Candidatos</h2>
        {data.candidates.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Pendiente — se activa en la Etapa 2 (análisis con IA).
          </p>
        ) : (
          <ul className="space-y-2">
            {data.candidates.map((c) => (
              <li key={c.id} className="text-sm border border-neutral-800 rounded-lg p-2">
                <p>
                  {formatTime(c.startSec)} – {formatTime(c.endSec)} · Puntuación estimada:{" "}
                  <strong>{c.score}</strong>/100 · {c.status}
                </p>
                <p className="text-neutral-400">{c.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">Clips</h2>
        {data.clips.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Pendiente — se activa en la Etapa 3 (generación con FFmpeg).
          </p>
        ) : (
          <ul className="space-y-2">
            {data.clips.map((c) => (
              <li key={c.id} className="text-sm border border-neutral-800 rounded-lg p-2">
                {c.title} · {c.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
