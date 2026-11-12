import ProjectDetail from "@/components/ProjectDetail";
import Link from "next/link";
import { Suspense } from "react";

async function ProjectDetailLoader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetail projectId={id} />;
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 space-y-6">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Volver a proyectos
      </Link>
      <Suspense fallback={<p className="text-neutral-500">Cargando proyecto...</p>}>
        <ProjectDetailLoader params={params} />
      </Suspense>
    </main>
  );
}
