"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "setup" | "recording" | "finishing" | "finished";

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

function formatElapsed(sec: number) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const CHUNK_MS = 5000;

export default function LiveMobileRecorder() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [desiredClipCount, setDesiredClipCount] = useState(10);
  const [minClipSeconds, setMinClipSeconds] = useState(15);
  const [maxClipSeconds, setMaxClipSeconds] = useState(60);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pendingChunks, setPendingChunks] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);
  const [data, setData] = useState<ProjectData | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [secureContextOk, setSecureContextOk] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryQueueRef = useRef<Blob[]>([]);

  useEffect(() => {
    setSecureContextOk(
      typeof window !== "undefined" &&
        window.isSecureContext &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function uploadChunk(id: string, blob: Blob) {
    setPendingChunks((n) => n + 1);
    try {
      const formData = new FormData();
      formData.append("chunk", blob, "chunk.webm");
      const res = await fetch(`/api/projects/${id}/live/chunk`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("fallo subida");
    } catch {
      // Sin conexión o error de red: guardamos el fragmento para reintentar.
      // La grabación en el teléfono sigue sin interrupciones mientras tanto.
      retryQueueRef.current.push(blob);
      setFailedChunks((n) => n + 1);
    } finally {
      setPendingChunks((n) => Math.max(0, n - 1));
    }
  }

  async function flushRetryQueue(id: string) {
    const queue = retryQueueRef.current;
    retryQueueRef.current = [];
    setFailedChunks(0);
    for (const blob of queue) {
      await uploadChunk(id, blob);
    }
  }

  async function handleStart() {
    setStartError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Grabación en vivo ${new Date().toLocaleString("es")}`,
          mode: "LIVE_MOBILE",
          sourceType: "live_mobile",
          desiredClipCount,
          minClipSeconds,
          maxClipSeconds,
          format: "VERTICAL_9_16",
        }),
      });
      if (!createRes.ok) throw new Error("No se pudo crear la sesión");
      const { project } = await createRes.json();
      const id: string = project.id;
      setProjectId(id);

      const startRes = await fetch(`/api/projects/${id}/live/start`, { method: "POST" });
      if (!startRes.ok) throw new Error("No se pudo iniciar la grabación");

      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          if (navigator.onLine === false) {
            retryQueueRef.current.push(e.data);
            setFailedChunks((n) => n + 1);
          } else {
            uploadChunk(id, e.data);
          }
        }
      };
      recorder.start(CHUNK_MS);

      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const json = await res.json();
          setData(json.project);
        }
        if (retryQueueRef.current.length > 0 && navigator.onLine !== false) {
          flushRetryQueue(id);
        }
      }, 3000);

      setPhase("recording");
    } catch (err) {
      setStartError(
        err instanceof Error
          ? err.message
          : "No se pudo acceder a la cámara o al micrófono"
      );
      streamRef.current?.getTracks().forEach((t) => t.stop());
    }
  }

  function handlePauseResume() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (paused) {
      recorder.resume();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
  }

  async function handleStop() {
    if (!projectId) return;
    setPhase("finishing");
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);

    // Esperamos a que terminen de subirse los fragmentos pendientes antes de
    // avisarle al servidor que ya puede hacer la pasada final.
    while (pendingChunks > 0 || retryQueueRef.current.length > 0) {
      if (retryQueueRef.current.length > 0) await flushRetryQueue(projectId);
      await new Promise((r) => setTimeout(r, 500));
    }

    await fetch(`/api/projects/${projectId}/live/stop`, { method: "POST" });

    if (pollRef.current) clearInterval(pollRef.current);
    const res = await fetch(`/api/projects/${projectId}`);
    if (res.ok) setData((await res.json()).project);
    setPhase("finished");
  }

  const readyClips = data?.clips.filter((c) => c.status === "READY") ?? [];

  if (!secureContextOk) {
    return (
      <div className="mx-auto max-w-md p-6 text-center space-y-3">
        <h1 className="text-xl font-bold">Modo grabación en vivo</h1>
        <p className="text-amber-400 text-sm">
          Este navegador no permite acceder a la cámara aquí. El acceso a cámara/micrófono
          requiere una conexión segura (HTTPS) o abrir la app desde &quot;localhost&quot;.
          Si estás probando desde el teléfono en tu red local, necesitas configurar un
          certificado HTTPS temporal o un túnel — pregúntame y te ayudo a configurarlo.
        </p>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-md p-4 space-y-4">
        <h1 className="text-xl font-bold">Modo grabación en vivo</h1>
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
          <div>
            <label className="block text-sm text-neutral-400 mb-1">Cámara</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFacing("user")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                  facing === "user" ? "bg-indigo-600" : "bg-neutral-800"
                }`}
              >
                Frontal
              </button>
              <button
                onClick={() => setFacing("environment")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                  facing === "environment" ? "bg-indigo-600" : "bg-neutral-800"
                }`}
              >
                Trasera
              </button>
            </div>
          </div>
          {startError && <p className="text-red-400 text-sm">⚠ {startError}</p>}
          <button
            onClick={handleStart}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 font-medium"
          >
            Empezar a grabar
          </button>
        </div>
      </div>
    );
  }

  // Pantalla de grabación / resultados: mitad superior cámara, mitad inferior
  // panel desplazable de clips — tal como se pidió para el teléfono.
  return (
    <div className="flex flex-col h-dvh">
      <div className="relative h-1/2 bg-black shrink-0">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
        {phase === "recording" && (
          <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${paused ? "bg-amber-400" : "bg-red-500 animate-pulse"}`}
            />
            <span className="text-sm font-mono">{formatElapsed(elapsed)}</span>
            {paused && <span className="text-xs text-amber-400">pausado</span>}
          </div>
        )}
        {failedChunks > 0 && (
          <div className="absolute top-3 right-3 bg-amber-600/80 rounded-full px-3 py-1 text-xs">
            {failedChunks} fragmento(s) esperando conexión
          </div>
        )}
        {phase === "recording" && (
          <div className="absolute bottom-3 inset-x-3 flex justify-center gap-3">
            <button
              onClick={handlePauseResume}
              className="rounded-full bg-neutral-800/90 px-5 py-2 text-sm"
            >
              {paused ? "Reanudar" : "Pausar"}
            </button>
            <button onClick={handleStop} className="rounded-full bg-red-600 px-5 py-2 text-sm">
              Terminar
            </button>
          </div>
        )}
        {phase === "finishing" && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-sm">
            Procesando lo último grabado...
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <p className="text-sm text-neutral-400">
          {readyClips.length} de {data?.desiredClipCount ?? desiredClipCount} clips listos
          {data?.candidates && data.candidates.length > readyClips.length && (
            <> · {data.candidates.length - readyClips.length} más detectados/en proceso</>
          )}
        </p>
        {data?.errorMessage && (
          <p className="text-red-400 text-xs">⚠ {data.errorMessage}</p>
        )}

        {(data?.candidates.length ?? 0) === 0 ? (
          <p className="text-sm text-neutral-500">
            Todavía no se detectaron momentos. Sigue grabando — se van a ir mostrando aquí
            a medida que la IA encuentre algo, sin esperar a que termines.
          </p>
        ) : (
          <ul className="space-y-2">
            {data!.candidates.map((c) => {
              const clip = data!.clips.find((cl) => cl.candidateId === c.id);
              return (
                <li key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-2 text-sm">
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

        {phase === "finished" && (
          <p className="text-emerald-400 text-sm pt-2">
            Grabación finalizada. El video original se conservó completo.
          </p>
        )}
      </div>
    </div>
  );
}
