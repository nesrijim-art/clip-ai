"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/lib/types";
import { MODE_LABELS, STATUS_LABELS } from "@/lib/types";

export default function ProjectList() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => setProjects(data.projects))
      .catch(() => setProjects([]));
  }, []);

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
