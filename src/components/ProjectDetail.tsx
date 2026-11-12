"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/types";

interface Candidate {
  id: string;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
  category: string | null;
  suggestedTitle: string | null;
  suggestedDescription: string | null;
  suggestedHashtags: string | null;
  status: string;
  discardReason: string | null;
}

interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

interface Clip {
  id: string;
  title: string;
  description: string | null;
  hashtags: string | null;
  score: number;
  status: string;
  startSec: number;
  endSec: number;
  candidateId: string | null;
  errorMessage?: string | null;
  subtitlesJson?: string | null;
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
  sourceType: string;
  desiredClipCount: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  format: string;
  subtitleStyle: string;
  originalPath: string | null;
  errorMessage: string | null;
  candidates: Candidate[];
  clips: Clip[];
  segments: Segment[];
  storageBytes: number;
  estimatedCostUsd: number;
  deepgramSecondsUsed: number;
  claudeInputTokens: number;
  claudeOutputTokens: number;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

const SUBTITLE_STYLES: { value: string; label: string }[] = [
  { value: "default", label: "Clásico (blanco, abajo)" },
  { value: "bold-yellow", label: "Negrita amarilla (abajo)" },
  { value: "minimal-top", label: "Minimalista (arriba)" },
];

export default function ProjectDetail({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [data, setData] = useState<ProjectDetailData | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSummary, setAnalyzeSummary] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [discardDraftId, setDiscardDraftId] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState("");
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editCuesText, setEditCuesText] = useState("");
  const [editSubtitleStyle, setEditSubtitleStyle] = useState("default");
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json.project);
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Solo actualizamos en segundo plano mientras haya un proceso activo (y
  // nunca lanzamos una consulta nueva si la anterior sigue en curso), para no
  // dejar el polling corriendo para siempre en un proyecto en Error o quieto.
  const ACTIVE_STATUSES = new Set(["CONNECTING", "RECORDING", "TRANSCRIBING", "ANALYZING", "GENERATING"]);
  useEffect(() => {
    if (!data || !ACTIVE_STATUSES.has(data.status)) return;
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, data?.status]);

  async function handleTranscribe() {
    setTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/transcribe`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al transcribir");
      await load();
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setTranscribing(false);
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeSummary(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/analyze`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al analizar");
      await load();
      setAnalyzeSummary(json.summary ?? null);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerate(candidateId: string) {
    setGeneratingId(candidateId);
    setGenerateError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/candidates/${candidateId}/generate`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al generar el clip");
      await load();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleDiscard(candidateId: string, reason: string) {
    setDiscardingId(candidateId);
    try {
      await fetch(`/api/projects/${projectId}/candidates/${candidateId}/discard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      setDiscardDraftId(null);
      setDiscardReason("");
      await load();
    } finally {
      setDiscardingId(null);
    }
  }

  function openEditor(clip: Clip) {
    setEditingClipId(clip.id);
    setEditStart(clip.startSec.toFixed(2));
    setEditEnd(clip.endSec.toFixed(2));
    setEditSubtitleStyle(data?.subtitleStyle ?? "default");
    try {
      const cues: SubtitleCue[] = clip.subtitlesJson ? JSON.parse(clip.subtitlesJson) : [];
      setEditCuesText(cues.map((c) => c.text).join("\n"));
    } catch {
      setEditCuesText("");
    }
    setRegenerateError(null);
  }

  async function handleRegenerate(clip: Clip) {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const newStart = parseFloat(editStart);
      const newEnd = parseFloat(editEnd);
      let cues: SubtitleCue[] | undefined;
      if (clip.subtitlesJson) {
        const original: SubtitleCue[] = JSON.parse(clip.subtitlesJson);
        const lines = editCuesText.split("\n");
        if (lines.length === original.length) {
          cues = original.map((c, i) => ({ ...c, text: lines[i] }));
        }
      }
      const res = await fetch(`/api/clips/${clip.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startSec: newStart,
          endSec: newEnd,
          subtitleCues: cues,
          subtitleStyle: editSubtitleStyle,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error al regenerar");
      setEditingClipId(null);
      await load();
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDownloadAll() {
    setDownloadingAll(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/download-all`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(json.error || "No se pudo descargar");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.name || "clips"}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingAll(false);
    }
  }

  async function handleDeleteProject() {
    if (!window.confirm("¿Borrar este proyecto? Se eliminarán el video original y todos sus clips. Esta acción no se puede deshacer.")) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo borrar el proyecto");
      router.push("/");
    } catch (err) {
      setDeleting(false);
      alert(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  if (!data) return <p className="text-neutral-500">Cargando...</p>;

  const clips = data.clips ?? [];
  const candidates = data.candidates ?? [];
  const segments = data.segments ?? [];
  const readyClips = clips.filter((c) => c.status === "READY");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{data.name}</h1>
        <p className="text-neutral-400">
          {data.mode === "RECORDED"
            ? data.sourceType === "url"
              ? "Enlace"
              : "Video subido"
            : MODE_LABELS[data.mode]}{" "}
          · Estado: <strong>{STATUS_LABELS[data.status]}</strong>
        </p>
        {data.errorMessage &&
          data.errorMessage !== transcribeError &&
          data.errorMessage !== analyzeError &&
          data.errorMessage !== generateError &&
          data.errorMessage !== regenerateError && (
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
          solicitados · Candidatos detectados: {candidates.length}
        </p>
        {!data.originalPath && (
          <p className="text-amber-400 text-sm mt-2">
            Aún no se subió el archivo de video para este proyecto.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Transcripción</h2>
          {data.originalPath && (
            <button
              onClick={handleTranscribe}
              disabled={transcribing || data.status === "TRANSCRIBING"}
              className="text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5"
            >
              {transcribing || data.status === "TRANSCRIBING"
                ? "Transcribiendo con Deepgram..."
                : segments.length > 0
                ? "Volver a transcribir"
                : "Transcribir con Deepgram"}
            </button>
          )}
        </div>
        {transcribeError && (
          <p className="text-red-400 text-sm mb-2">⚠ {transcribeError}</p>
        )}
        {segments.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {data.originalPath
              ? "Todavía no se ha transcrito este video. Presiona el botón de arriba."
              : "Sube un video primero para poder transcribirlo."}
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto text-sm">
            {segments.map((s) => (
              <p key={s.id}>
                <span className="text-neutral-500">[{formatTime(s.startSec)}]</span>{" "}
                {s.text}
              </p>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">Candidatos</h2>
          {segments.length > 0 && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing || data.status === "ANALYZING"}
              className="text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5"
            >
              {analyzing || data.status === "ANALYZING"
                ? "Analizando con Claude..."
                : candidates.length > 0
                ? "Volver a analizar"
                : "Analizar con Claude"}
            </button>
          )}
        </div>
        {analyzeError && <p className="text-red-400 text-sm mb-2">⚠ {analyzeError}</p>}
        {analyzeSummary && (
          <p className="text-neutral-400 text-sm italic mb-2">{analyzeSummary}</p>
        )}
        {candidates.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {segments.length > 0
              ? "Todavía no se ha analizado este video. Presiona el botón de arriba."
              : "Transcribe el video primero para poder analizarlo."}
          </p>
        ) : (
          <ul className="space-y-2">
            {candidates
              .filter((c) => c.status !== "DISCARDED")
              .map((c) => {
                const clip = clips.find((cl) => cl.candidateId === c.id);
                const isGenerating = generatingId === c.id || clip?.status === "GENERATING";
                return (
                  <li key={c.id} className="text-sm border border-neutral-800 rounded-lg p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {c.suggestedTitle || "(sin título sugerido)"}
                        </p>
                        <p>
                          {formatTime(c.startSec)} – {formatTime(c.endSec)} · Potencial
                          estimado: <strong>{c.score}</strong>/100
                          {c.category && <> · {c.category}</>}
                        </p>
                        <p className="text-neutral-400">{c.reason}</p>
                        {c.suggestedDescription && (
                          <p className="text-neutral-500 text-xs mt-1">
                            &quot;{c.suggestedDescription}&quot;
                          </p>
                        )}
                        {c.suggestedHashtags && (
                          <p className="text-indigo-400 text-xs">
                            {c.suggestedHashtags
                              .split(/\s+/)
                              .filter(Boolean)
                              .map((h) => `#${h}`)
                              .join(" ")}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          onClick={() => handleGenerate(c.id)}
                          disabled={isGenerating}
                          className="text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5"
                        >
                          {isGenerating
                            ? "Generando..."
                            : clip?.status === "READY"
                            ? "Regenerar"
                            : "Generar clip"}
                        </button>
                        <button
                          onClick={() => {
                            setDiscardDraftId(c.id);
                            setDiscardReason("");
                          }}
                          disabled={discardingId === c.id}
                          className="text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 px-3 py-1.5"
                        >
                          Descartar
                        </button>
                      </div>
                    </div>
                    {clip?.status === "ERROR" && (
                      <p className="text-red-400 text-xs mt-1">⚠ {clip.errorMessage}</p>
                    )}
                    {discardDraftId === c.id && (
                      <div className="border-t border-neutral-800 pt-2 mt-2 space-y-2">
                        <label className="text-xs text-neutral-400 block">
                          Motivo del descarte (opcional)
                          <input
                            autoFocus
                            value={discardReason}
                            onChange={(e) => setDiscardReason(e.target.value)}
                            className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 mt-0.5"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleDiscard(c.id, discardReason)}
                            disabled={discardingId === c.id}
                            className="text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 disabled:opacity-50 px-3 py-1.5"
                          >
                            {discardingId === c.id ? "Descartando..." : "Confirmar descarte"}
                          </button>
                          <button
                            onClick={() => setDiscardDraftId(null)}
                            className="text-xs rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
        {generateError && <p className="text-red-400 text-sm mt-2">⚠ {generateError}</p>}

        {candidates.some((c) => c.status === "DISCARDED") && (
          <details className="mt-3">
            <summary className="text-xs text-neutral-500 cursor-pointer">
              Descartados ({candidates.filter((c) => c.status === "DISCARDED").length})
            </summary>
            <ul className="mt-2 space-y-1">
              {candidates
                .filter((c) => c.status === "DISCARDED")
                .map((c) => (
                  <li key={c.id} className="text-xs text-neutral-500">
                    {formatTime(c.startSec)}–{formatTime(c.endSec)}:{" "}
                    {c.suggestedTitle || "(sin título)"} — {c.discardReason}
                  </li>
                ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">
            Clips listos: {readyClips.length} de {data.desiredClipCount}
          </h2>
          {readyClips.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloadingAll}
              className="text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5"
            >
              {downloadingAll ? "Preparando zip..." : "Descargar todos (.zip)"}
            </button>
          )}
        </div>
        {clips.length === 0 ? (
          <p className="text-sm text-neutral-500">
            Todavía no hay clips generados. Usa el botón &quot;Generar clip&quot; en un
            candidato de arriba.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clips.map((c) => (
              <li key={c.id} className="text-sm border border-neutral-800 rounded-lg p-2 space-y-2">
                {c.status === "READY" ? (
                  <video
                    src={`/api/clips/${c.id}/download`}
                    poster={`/api/clips/${c.id}/thumbnail`}
                    controls
                    className="w-full rounded-lg bg-black max-h-80"
                  />
                ) : (
                  <div className="w-full aspect-[9/16] max-h-80 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs">
                    {c.status === "GENERATING" ? "Generando..." : c.status}
                  </div>
                )}
                <p className="font-medium">{c.title}</p>
                <p className="text-neutral-400">
                  {formatTime(c.startSec)} – {formatTime(c.endSec)} · Potencial {c.score}/100
                </p>
                {c.description && <p className="text-neutral-500 text-xs">{c.description}</p>}
                {c.hashtags && (
                  <p className="text-indigo-400 text-xs">
                    {c.hashtags
                      .split(/\s+/)
                      .filter(Boolean)
                      .map((h) => `#${h}`)
                      .join(" ")}
                  </p>
                )}
                {c.status === "READY" && (
                  <div className="flex gap-2">
                    <a
                      href={`/api/clips/${c.id}/download`}
                      download
                      className="inline-block text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5"
                    >
                      Descargar
                    </a>
                    <button
                      onClick={() => openEditor(c)}
                      className="text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5"
                    >
                      Ajustar recorte / subtítulos
                    </button>
                  </div>
                )}
                {editingClipId === c.id && (
                  <div className="border-t border-neutral-800 pt-2 mt-2 space-y-2">
                    <div className="flex gap-2">
                      <label className="text-xs text-neutral-400 flex-1">
                        Inicio (s)
                        <input
                          type="number"
                          step="0.1"
                          value={editStart}
                          onChange={(e) => setEditStart(e.target.value)}
                          className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 mt-0.5"
                        />
                      </label>
                      <label className="text-xs text-neutral-400 flex-1">
                        Fin (s)
                        <input
                          type="number"
                          step="0.1"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                          className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 mt-0.5"
                        />
                      </label>
                    </div>
                    <label className="text-xs text-neutral-400 block">
                      Estilo de subtítulos
                      <select
                        value={editSubtitleStyle}
                        onChange={(e) => setEditSubtitleStyle(e.target.value)}
                        className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 mt-0.5"
                      >
                        {SUBTITLE_STYLES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-neutral-400 block">
                      Subtítulos (una línea = una intervención; no agregues ni quites
                      líneas, solo corrige el texto)
                      <textarea
                        value={editCuesText}
                        onChange={(e) => setEditCuesText(e.target.value)}
                        rows={4}
                        className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1 mt-0.5 font-mono text-xs"
                      />
                    </label>
                    {regenerateError && (
                      <p className="text-red-400 text-xs">⚠ {regenerateError}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRegenerate(c)}
                        disabled={regenerating}
                        className="text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-3 py-1.5"
                      >
                        {regenerating ? "Regenerando..." : "Guardar y regenerar"}
                      </button>
                      <button
                        onClick={() => setEditingClipId(null)}
                        className="text-xs rounded-lg bg-neutral-700 hover:bg-neutral-600 px-3 py-1.5"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2">Uso y costos (estimado)</h2>
        <ul className="text-sm text-neutral-400 space-y-1">
          <li>Almacenamiento usado: {formatBytes(data.storageBytes)}</li>
          <li>Audio transcrito (Deepgram): {Math.round(data.deepgramSecondsUsed)} s</li>
          <li>
            Tokens de Claude: {data.claudeInputTokens.toLocaleString("es")} entrada /{" "}
            {data.claudeOutputTokens.toLocaleString("es")} salida
          </li>
          <li className="text-neutral-300">
            Costo estimado: <strong>${data.estimatedCostUsd.toFixed(4)} USD</strong>
          </li>
        </ul>
        <p className="text-xs text-neutral-600 mt-2">
          Estimación aproximada basada en el uso registrado por esta app, usando precios de
          referencia. No es una factura — revisa el consumo real en tu cuenta de Anthropic y
          de Deepgram.
        </p>
      </section>

      <section className="rounded-xl border border-red-900/50 bg-neutral-900 p-4">
        <h2 className="font-semibold mb-2 text-red-400">Zona de peligro</h2>
        <p className="text-sm text-neutral-400 mb-3">
          Borra este proyecto, su video original y todos sus clips. No se puede deshacer.
        </p>
        <button
          onClick={handleDeleteProject}
          disabled={deleting}
          className="text-sm rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 px-4 py-2"
        >
          {deleting ? "Borrando..." : "Borrar proyecto"}
        </button>
      </section>
    </div>
  );
}
