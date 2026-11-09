import NewProjectForm from "@/components/NewProjectForm";
import ProjectList from "@/components/ProjectList";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Clip-AI</h1>
        <p className="text-neutral-400">
          Detecta momentos con potencial y genera clips cortos automáticamente.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/live-mobile"
          className="rounded-lg border border-neutral-700 px-4 py-2 hover:border-neutral-500"
        >
          📱 Modo grabación en vivo (teléfono)
        </Link>
      </div>

      <NewProjectForm />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Proyectos</h2>
        <ProjectList />
      </section>
    </main>
  );
}
