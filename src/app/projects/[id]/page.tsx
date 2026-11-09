import ProjectDetail from "@/components/ProjectDetail";
import Link from "next/link";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 space-y-6">
      <Link href="/" className="text-sm text-neutral-400 hover:text-neutral-200">
        ← Volver a proyectos
      </Link>
      <ProjectDetail projectId={id} />
    </main>
  );
}
