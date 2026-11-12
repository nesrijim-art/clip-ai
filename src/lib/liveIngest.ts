import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { originalPathFor, ensureDataDirs } from "@/lib/storage";
import { processLiveProject } from "@/lib/liveProcessor";

// Puerto donde FFmpeg escucha transmisiones RTMP entrantes (OBS, teléfono,
// cualquier encoder compatible). Es el puerto estándar que usan la mayoría
// de los programas de transmisión por defecto.
export const RTMP_PORT = 1935;
const PROCESS_INTERVAL_MS = 20_000;

interface ActiveIngest {
  projectId: string;
  proc: ChildProcess;
  interval: ReturnType<typeof setInterval>;
}

// Límite deliberado de la v1: una sola transmisión externa activa a la vez
// en todo el servidor (FFmpeg ocupa el puerto 1935 por completo mientras
// escucha). Soportar varias en simultáneo requeriría un servidor RTMP de
// verdad (ej. MediaMTX) que reparta por clave de transmisión.
let active: ActiveIngest | null = null;

export function streamKeyFor(projectId: string): string {
  return projectId;
}

export function rtmpUrlFor(projectId: string, host: string): string {
  return `rtmp://${host}:${RTMP_PORT}/live/${streamKeyFor(projectId)}`;
}

export function getActiveIngestProjectId(): string | null {
  return active?.projectId ?? null;
}

export class IngestBusyError extends Error {}

/**
 * Arranca un servidor RTMP de un solo uso (FFmpeg en modo "listen") que
 * espera la conexión de OBS/el teléfono y va grabando lo que reciba en un
 * archivo .mp4 fragmentado (se puede leer y analizar mientras sigue
 * creciendo). Igual que en el modo de grabación con el teléfono, el análisis
 * corre aparte y nunca bloquea la recepción de la transmisión.
 */
export async function startIngest(projectId: string): Promise<{ rtmpPath: string }> {
  if (active) {
    throw new IngestBusyError(
      active.projectId === projectId
        ? "Esta transmisión ya está esperando conexión."
        : "Ya hay otra transmisión en curso en este servidor. Termínala antes de iniciar una nueva."
    );
  }

  ensureDataDirs();
  const outputPath = originalPathFor(projectId, ".mp4");
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

  const rtmpPath = `live/${streamKeyFor(projectId)}`;
  const listenUrl = `rtmp://0.0.0.0:${RTMP_PORT}/${rtmpPath}?listen=1`;

  const proc = spawn(
    "ffmpeg",
    [
      "-y",
      "-listen",
      "1",
      "-timeout",
      "1800000000", // microsegundos: esperar hasta 30 min a que alguien se conecte
      // (el límite de FFmpeg para este parámetro es ~35 minutos; si nadie se
      // conecta en ese plazo, "Generar clave de transmisión" se vuelve a pedir)
      "-i",
      listenUrl,
      "-c",
      "copy",
      "-f",
      "mp4",
      "-movflags",
      "+frag_keyframe+empty_moov+default_base_moof",
      outputPath,
    ],
    { windowsHide: true }
  );

  await prisma.project.update({
    where: { id: projectId },
    data: { status: "CONNECTING", isRecording: true, originalPath: outputPath, errorMessage: null },
  });

  let sawFirstFrame = false;
  let stderrTail = "";
  proc.stderr.on("data", async (d) => {
    const text = d.toString();
    stderrTail = (stderrTail + text).slice(-2000);
    if (!sawFirstFrame && /frame=/.test(text)) {
      sawFirstFrame = true;
      await prisma.project
        .update({ where: { id: projectId }, data: { status: "RECORDING" } })
        .catch(() => {});
    }
  });

  proc.on("exit", async (code) => {
    if (active?.proc === proc) {
      clearInterval(active.interval);
      active = null;
    }
    // Si terminó solo (nadie lo detuvo con stopIngest) sin haber llegado a
    // recibir nada, fue un error real de arranque — lo dejamos visible.
    if (!sawFirstFrame && code !== 0 && code !== null) {
      await prisma.project
        .update({
          where: { id: projectId },
          data: {
            status: "ERROR",
            isRecording: false,
            errorMessage: `FFmpeg no pudo iniciar el servidor de ingesta: ${stderrTail.trim().slice(-500)}`,
          },
        })
        .catch(() => {});
    }
  });
  proc.on("error", async (err) => {
    await prisma.project
      .update({ where: { id: projectId }, data: { status: "ERROR", isRecording: false, errorMessage: `FFmpeg: ${err.message}` } })
      .catch(() => {});
  });

  const interval = setInterval(() => {
    void processLiveProject(projectId);
  }, PROCESS_INTERVAL_MS);

  active = { projectId, proc, interval };
  return { rtmpPath: listenUrl };
}

/**
 * Corta la transmisión actual (si la hay), procesa lo último pendiente y
 * deja el proyecto listo para seguir usándose como un video grabado normal.
 */
export async function stopIngest(projectId: string): Promise<void> {
  if (active && active.projectId === projectId) {
    clearInterval(active.interval);
    const proc = active.proc;
    active = null;
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      proc.kill("SIGINT"); // así FFmpeg cierra bien el .mp4 (moov/fragmentos)
      setTimeout(() => {
        proc.kill("SIGKILL");
        resolve();
      }, 5000);
    });
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { isRecording: false, status: "ANALYZING" },
  });
  await processLiveProject(projectId, { force: true });
  await prisma.project.update({ where: { id: projectId }, data: { status: "FINISHED" } });
}
