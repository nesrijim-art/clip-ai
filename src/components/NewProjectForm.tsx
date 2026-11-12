"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "creating" | "uploading" | "checking" | "downloading" | "error";
type Source = "upload" | "url";

const SUBTITLE_STYLES = [
  { value: "default", label: "Clásico (blanco, abajo)" },
  { value: "bold-yellow", label: "Negrita amarilla (abajo)" },
  { value: "minimal-top", label: "Minimalista (arriba)" },
];

export default function NewProjectForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [desiredClipCount, setDesiredClipCount] = useState(5);
  const [minClipSeconds, setMinClipSeconds] = useState(20);
  const [maxClipSeconds, setMaxClipSeconds] = useState(90);
  const [format, setFormat] = useState<"VERTICAL_9_16" | "SQUARE_1_1" | "HORIZONTAL_16_9">(
    "VERTICAL_9_16"
  );
  const [language, setLanguage] = useState("es");
  const [subtitleStyle, setSubtitleStyle] = useState("default");
  const [minQualityScore, setMinQualityScore] = useState(50);
  const [priorityTopics, setPriorityTopics] = useState("");
  const [excludedTopics, setExcludedTopics] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // El mensaje de error de un intento anterior no debe quedar pegado una vez
  // que el usuario corrige el campo que lo causó.
  useEffect(() => {
    setErrorMsg(null);
  }, [source, url, file, minClipSeconds, maxClipSeconds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (source === "upload" && !file) {
      setErrorMsg("Selecciona un archivo de video para subir.");
      return;
    }
    if (source === "url" && !url.trim()) {
      setErrorMsg("Pega un enlace de video.");
      return;
    }
    if (minClipSeconds < 5 || maxClipSeconds < 5) {
      setErrorMsg("La duración mínima y máxima deben ser de al menos 5 segundos.");
      return;
    }
    if (maxClipSeconds < minClipSeconds) {
      setErrorMsg("La duración máxima no puede ser menor que la mínima.");
      return;
    }

    let createdProjectId: string | null = null;
    try {
      setStep("creating");
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || file?.name || "Proyecto desde enlace",
          mode: "RECORDED",
          sourceType: source,
          desiredClipCount,
          minClipSeconds,
          maxClipSeconds,
          format,
          language,
          subtitleLanguage: language,
          subtitleStyle,
          minQualityScore,
          priorityTopics: priorityTopics.trim() || null,
          excludedTopics: excludedTopics.trim() || null,
        }),
      });
      if (!createRes.ok) throw new Error("No se pudo crear el proyecto");
      const { project } = await createRes.json();
      createdProjectId = project.id;
      window.dispatchEvent(new Event("clipai:projects-changed"));

      if (source === "upload") {
        setStep("uploading");
        const formData = new FormData();
        formData.append("file", file!);
        const uploadRes = await fetch(`/api/projects/${project.id}/upload`, {
          method: "POST",
          body: formData,
        });
        if (!uploadRes.ok) {
          const body = await uploadRes.json().catch(() => ({}));
          throw new Error(body.error || "No se pudo subir el archivo");
        }
      } else {
        setStep("checking");
        const importRes = await fetch(`/api/projects/${project.id}/import-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (!importRes.ok) {
          const body = await importRes.json().catch(() => ({}));
          throw new Error(body.error || "No se pudo usar ese enlace");
        }
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      // Si el proyecto llegó a crearse pero subir el archivo o importar el
      // enlace falló, lo borramos para no dejarlo huérfano en la lista.
      if (createdProjectId) {
        fetch(`/api/projects/${createdProjectId}`, { method: "DELETE" })
          .catch(() => {})
          .finally(() => window.dispatchEvent(new Event("clipai:projects-changed")));
      }
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  const busy = step === "creating" || step === "uploading" || step === "checking" || step === "downloading";
  const durationInvalid = minClipSeconds < 5 || maxClipSeconds < 5 || maxClipSeconds < minClipSeconds;

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
    >
      <h2 className="text-lg font-semibold">Nuevo proyecto — Video grabado</h2>

      <input
        key="file-input"
        ref={fileInputRef}
        type="file"
        accept=".mp4,.mov,.webm,.mkv,.m4v,video/*"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setSource("upload");
            fileInputRef.current?.click();
          }}
          className={`flex-1 rounded-lg px-3 py-2 text-sm ${
            source === "upload" ? "bg-indigo-600" : "bg-neutral-800"
          }`}
        >
          Subir archivo
        </button>
        <button
          type="button"
          onClick={() => setSource("url")}
          className={`flex-1 rounded-lg px-3 py-2 text-sm ${
            source === "url" ? "bg-indigo-600" : "bg-neutral-800"
          }`}
        >
          Pegar enlace
        </button>
      </div>

      <div>
        <label className="block text-sm text-neutral-400 mb-1">Nombre del proyecto</label>
        <input
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Podcast episodio 12"
        />
      </div>

      {source === "upload" ? (
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Archivo de video</label>
          {file ? (
            <div className="flex items-center justify-between rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm">
              <span className="truncate">📹 {file.name}</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 text-indigo-400 hover:text-indigo-300 text-xs ml-2"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-lg bg-neutral-800 border border-dashed border-neutral-700 px-3 py-2 text-sm text-neutral-500 hover:border-neutral-500"
            >
              Ningún archivo seleccionado — toca para elegir un video
            </button>
          )}
        </div>
      ) : (
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Enlace del video</label>
          <input
            key="url-input"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
          />
          <p className="text-xs text-neutral-500 mt-1">
            Solo funciona con contenido público y accesible (tuyo o autorizado). Si la
            plataforma lo bloquea, te lo diremos con el motivo — no se puede eludir esa
            restricción.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Mín. duración (s)</label>
          <input
            type="number"
            min={5}
            value={minClipSeconds}
            onChange={(e) => setMinClipSeconds(Number(e.target.value))}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
          />
          {minClipSeconds < 5 && (
            <p className="text-xs text-red-400 mt-1">Mínimo 5 segundos.</p>
          )}
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
          {maxClipSeconds < 5 ? (
            <p className="text-xs text-red-400 mt-1">Mínimo 5 segundos.</p>
          ) : (
            maxClipSeconds < minClipSeconds && (
              <p className="text-xs text-red-400 mt-1">No puede ser menor que la mínima.</p>
            )
          )}
        </div>
        <div>
          <label className="block text-sm text-neutral-400 mb-1">Formato</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
          >
            <option value="VERTICAL_9_16">Vertical 9:16</option>
            <option value="SQUARE_1_1">Cuadrado 1:1</option>
            <option value="HORIZONTAL_16_9">Horizontal 16:9</option>
          </select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-sm text-indigo-400 hover:text-indigo-300"
      >
        {showAdvanced ? "Ocultar opciones avanzadas ▲" : "Más opciones (idioma, temas, calidad, estilo) ▼"}
      </button>

      {showAdvanced && (
        <div className="space-y-3 border-t border-neutral-800 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Idioma del contenido y subtítulos
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              >
                <option value="es">Español</option>
                <option value="en">Inglés</option>
                <option value="pt">Portugués</option>
                <option value="fr">Francés</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-neutral-400 mb-1">Estilo de subtítulos</label>
              <select
                value={subtitleStyle}
                onChange={(e) => setSubtitleStyle(e.target.value)}
                className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
              >
                {SUBTITLE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Nivel mínimo de calidad para aceptar un fragmento: {minQualityScore}/100
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={minQualityScore}
              onChange={(e) => setMinQualityScore(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Temas prioritarios (opcional, separados por coma)
            </label>
            <input
              value={priorityTopics}
              onChange={(e) => setPriorityTopics(e.target.value)}
              placeholder="Ej. consejos de cocina, anécdotas personales"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              Temas a excluir (opcional, separados por coma)
            </label>
            <input
              value={excludedTopics}
              onChange={(e) => setExcludedTopics(e.target.value)}
              placeholder="Ej. política, datos personales"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
            />
          </div>
        </div>
      )}

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button
        type="submit"
        disabled={busy || durationInvalid}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 font-medium"
      >
        {step === "creating" && "Creando proyecto..."}
        {step === "uploading" && "Subiendo video..."}
        {step === "checking" && "Verificando enlace y descargando..."}
        {(step === "idle" || step === "error") && "Crear proyecto"}
      </button>
    </form>
  );
}
