import Link from "next/link";

export default function LiveMobilePlaceholder() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-10 text-center space-y-4">
      <h1 className="text-xl font-bold">Modo grabación en vivo (teléfono)</h1>
      <p className="text-neutral-400 text-sm">
        Esta herramienta se construye en la Etapa 5 del plan, una vez que el motor de
        transcripción, análisis y generación de clips esté probado con video grabado.
        Todavía no está disponible — no es una función simulada, simplemente no está
        conectada aún.
      </p>
      <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">
        ← Volver al inicio
      </Link>
    </main>
  );
}
