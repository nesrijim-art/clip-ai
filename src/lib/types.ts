export type ProjectMode = "RECORDED" | "LIVE_STREAM" | "LIVE_MOBILE";
export type ProjectStatus =
  | "CREATED"
  | "CONNECTING"
  | "RECORDING"
  | "TRANSCRIBING"
  | "ANALYZING"
  | "GENERATING"
  | "FINISHED"
  | "ERROR";
export type ClipFormat = "VERTICAL_9_16" | "SQUARE_1_1" | "HORIZONTAL_16_9";

export interface ProjectSummary {
  id: string;
  name: string;
  mode: ProjectMode;
  status: ProjectStatus;
  createdAt: string;
  desiredClipCount: number;
  format: ClipFormat;
  originalPath: string | null;
  _count: { clips: number; candidates: number };
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  CREATED: "Creado",
  CONNECTING: "Conectando",
  RECORDING: "Grabando",
  TRANSCRIBING: "Transcribiendo",
  ANALYZING: "Analizando",
  GENERATING: "Generando clips",
  FINISHED: "Finalizado",
  ERROR: "Error",
};

export const MODE_LABELS: Record<ProjectMode, string> = {
  RECORDED: "Video grabado",
  LIVE_STREAM: "Transmisión en vivo",
  LIVE_MOBILE: "Grabación con el teléfono",
};
