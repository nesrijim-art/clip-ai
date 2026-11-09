"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "creating" | "uploading" | "error";

export default function NewProjectForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [desiredClipCount, setDesiredClipCount] = useState(5);
  const [minClipSeconds, setMinClipSeconds] = useState(20);
  const [maxClipSeconds, setMaxClipSeconds] = useState(90);
  const [format, setFormat] = useState<"VERTICAL_9_16" | "SQUARE_1_1" | "HORIZONTAL_16_9">(
    "VERTICAL_9_16"
  );
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setErrorMsg("Selecciona un archivo de video para subir.");
      return;
    }
    if (maxClipSeconds < minClipSeconds) {
      setErrorMsg("La duración máxima no puede ser menor que la mínima.");
      return;
    }

    try {
      setStep("creating");
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || file.name,
          mode: "RECORDED",
          sourceType: "upload",
          desiredClipCount,
          minClipSeconds,
          maxClipSeconds,
          format,
        }),
      });
      if (!createRes.ok) throw new Error("No se pudo crear el proyecto");
      const { project } = await createRes.json();

      setStep("uploading");
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch(`/api/projects/${project.id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error || "No se pudo subir el archivo");
      }

      router.push(`/projects/${project.id}`);
    } catch (err) {
      setStep("error");
      setErrorMsg(err instanceof Error ? err.message : "Error inesperado");
    }
  }

  const busy = step === "creating" || step === "uploading";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 space-y-4"
    >
      <h2 className="text-lg font-semibold">Nuevo proyecto — Video grabado</h2>

      <div>
        <label className="block text-sm text-neutral-400 mb-1">Nombre del proyecto</label>
        <input
          className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Podcast episodio 12"
        />
      </div>

      <div>
        <label className="block text-sm text-neutral-400 mb-1">Archivo de video</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp4,.mov,.webm,.mkv,.m4v,video/*"
          className="w-full text-sm"
        />
      </div>

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

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 font-medium"
      >
        {step === "creating" && "Creando proyecto..."}
        {step === "uploading" && "Subiendo video..."}
        {(step === "idle" || step === "error") && "Crear y subir"}
      </button>
    </form>
  );
}
