"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "setup" | "connecting" | "live" | "finishing" | "finished";

interface Candidate {
  id: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  category: string | null;
  suggestedTitle: string | null;
  status: string;
}

interface Clip {
  id: string;
  title: string;
  score: number;
  status: string;
  startSec: number;
  endSec: number;
  candidateId: string | null;
}

interface ProjectData {
  id: string;
  status: string;
  desiredClipCount: number;
  errorMessage: string | null;
  candidates: Candidate[];
  clips: Clip[];
}

export default function LiveStreamPanel() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [desiredClipCount, setDesiredClipCount] = useState(10);
  const [minClipSeconds, setMinClipSeconds] = useState(20);
  const [maxClipSeconds, setMaxClipSeconds] = useState(90);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [connInfo, setConnInfo] = useState<{ rtmpServer: string; streamKey: string } | null>(null);
  const [data, setData] = useState<ProjectData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleStart() {
    setSetupError(null);
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Transmisión en vivo ${new Date().toLocaleString("es")}`,
          mode: "LIVE_STREAM",
          sourceType: "live_stream",
          desiredClipCount,
          minClipSeconds,
          maxClipSeconds,
          format: "VERTICAL_9_16",
        }),
      });
      if (!createRes.ok) throw new Error("No se pudo crear la sesión");
      const { project } = await createRes.json();
      setProjectId(project.id);

      const ingestRes = await fetch(`/api/projects/${project.id}/live/ingest/start`, {
        method: "POST",
      });
      const ingestJson = await ingestRes.json();
      if (!ingestRes.ok) throw new Error(ingestJson.error || "No se pudo iniciar la ingesta");
      setConnInfo({ rtmpServer: ingestJson.rtmpServer, streamKey: ingestJson.streamKey });

      setPhase("connecting");
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/projects/${project.id}`);
        if (res.ok) {
          const json = await res.json();
          setData(json.project);
          if (json.project.status === "RECORDING") setPhase("live");
          if (json.project.status === "ERROR") setSetupError(json.project.errorMessage);
        }
      }, 3000);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  async function handleStop() {
    if (!projectId) return;
    setPhase("finishing");
    const res = await fetch(`/api/projects/${projectId}/live/ingest/stop`, { method: "POST" });
    if (pollRef.current) clearInterval(pollRef.current);
    if (res.ok) {
      const { project } = await res.json();
      setData(project);
    }
    setPhase("finished");
  }

  const readyClips = data?.clips.filter((c) => c.status === "READY") ?? [];

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-bold">Transmisión en vivo (OBS / encoder externo)</h1>
        <p className="text-sm text-neutral-400">
          Conecta tu propia transmisión (desde OBS o cualquier programa compatible con RTMP) a
          un servidor de ingesta que genera esta aplicación. No se puede pegar el enlace de
          cualquier transmisión ajena — solo se admite tu propia señal, enviada directamente
          aquí.
        </p>
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Cantidad de clips</label>
            <input
              type="number"
              min={1}
              max={50}
              value={desiredClipCount}
              onChange={(e) => setDesiredClipCount(Number(e.target.value))}
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Mín. duración (s)</label>
              <input
                type="number"
                min={5}
                value={minClipSeconds}
                onChange={(e) => setMinClipSeconds(Number(e.target.value))}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Máx. duración (s)</label>
              <input
                type="number"
                min={5}
                value={maxClipSeconds}
                onChange={(e) => setMaxClipSeconds(Number(e.target.value))}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              />
            </div>
          </div>
          {setupError && <p className="text-red-400 text-sm">⚠ {setupError}</p>}
          <button
            onClick={handleStart}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 font-medium"
          >
            Generar clave de transmisión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <h1 className="text-xl font-bold">Transmisión en vivo</h1>

      {(phase === "connecting" || phase === "live") && connInfo && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 space-y-2">
          <p className="text-sm text-neutral-400">
            Configura esto en OBS (Ajustes → Emisión → Personalizado):
          </p>
          <div className="text-sm font-mono bg-neutral-800 rounded-lg p-2 break-all">
            Servidor: {connInfo.rtmpServer}
          </div>
          <div className="text-sm font-mono bg-neutral-800 rounded-lg p-2 break-all">
            Clave de transmisión: {connInfo.streamKey}
          </div>
          <p className="text-sm">
            Estado:{" "}
            <strong>
              {phase === "connecting" ? "Esperando que empieces a transmitir..." : "Recibiendo transmisión ●"}
            </strong>
          </p>
          <button onClick={handleStop} className="rounded-lg bg-red-600 px-4 py-2 text-sm">
            Terminar transmisión
          </button>
        </div>
      )}

      {phase === "finishing" && (
        <p className="text-sm text-neutral-400">Procesando lo último recibido...</p>
      )}
      {phase === "finished" && (
        <p className="text-emerald-400 text-sm">
          Transmisión finalizada. El video original se conservó completo.
        </p>
      )}

      {data?.errorMessage && <p className="text-red-400 text-sm">⚠ {data.errorMessage}</p>}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <p className="text-sm text-neutral-400 mb-2">
          {readyClips.length} de {data?.desiredClipCount ?? desiredClipCount} clips listos
        </p>
        {(data?.candidates.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">
            Todavía no se detectaron momentos. Van a ir apareciendo aquí sin esperar a que
            termines la transmisión.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data!.candidates.map((c) => {
              const clip = data!.clips.find((cl) => cl.candidateId === c.id);
              return (
                <li key={c.id} className="rounded-lg border border-neutral-800 p-2 text-sm">
                  {clip?.status === "READY" ? (
                    <video
                      src={`/api/clips/${clip.id}/download`}
                      controls
                      className="w-full rounded bg-black max-h-56 mb-1"
                    />
                  ) : (
                    <div className="w-full h-20 rounded bg-neutral-800 flex items-center justify-center text-xs text-neutral-500 mb-1">
                      {clip?.status === "GENERATING" ? "Generando..." : c.status}
                    </div>
                  )}
                  <p className="font-medium">{c.suggestedTitle || "(sin título)"}</p>
                  <p className="text-neutral-400 text-xs">
                    Potencial {c.score}/100 {c.category && `· ${c.category}`}
                  </p>
                  {clip?.status === "READY" && (
                    <a
                      href={`/api/clips/${clip.id}/download`}
                      download
                      className="inline-block mt-1 text-xs rounded bg-indigo-600 px-2 py-1"
                    >
                      Descargar
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
