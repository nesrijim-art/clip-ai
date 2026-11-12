"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/types";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/types";

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setError(null);
    fetch("/api/projects")
      .then((r) => {
        if (!r.ok) throw new Error(`La API respondió ${r.status}`);
        return r.json();
      })
      .then((data) => setProjects(data.projects))
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al cargar proyectos");
        setProjects(null);
      });
  }, [reloadKey]);

  // El formulario de arriba avisa con este evento cuando crea, borra o
  // falla en crear un proyecto, para que la lista se actualice sola.
  useEffect(() => {
    function onProjectsChanged() {
      setReloadKey((k) => k + 1);
    }
    window.addEventListener("clipai:projects-changed", onProjectsChanged);
    return () => window.removeEventListener("clipai:projects-changed", onProjectsChanged);
  }, []);

  if (error) {
    return (
      <div className="text-sm space-y-2">
        <p className="text-red-400">No se pudieron cargar los proyectos: {error}</p>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-lg bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-neutral-200"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (projects === null) {
    return <p className="text-neutral-500 text-sm">Cargando proyectos...</p>;
  }

  if (projects.length === 0) {
    return (
      <p className="text-neutral-500 text-sm">
        Todavía no hay proyectos. Crea uno con el formulario de arriba.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {projects.map((p) => (
        <li key={p.id}>
          <Link
            href={`/projects/${p.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-neutral-600 transition"
          >
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-neutral-500">
                {MODE_LABELS[p.mode]} · {STATUS_LABELS[p.status]}
              </p>
            </div>
            <div className="text-sm text-neutral-400 text-right">
              <p>
                {p._count.clips} clip{p._count.clips === 1 ? "" : "s"}
              </p>
              <p>{p._count.candidates} candidatos</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
