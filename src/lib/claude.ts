import Anthropic from "@anthropic-ai/sdk";

// Análisis real de la transcripción con Claude para detectar momentos con
// potencial. Usamos "salida estructurada": le pedimos a la IA que rellene
// una ficha con campos fijos (no texto libre), así el programa nunca falla
// al interpretar la respuesta.

export interface AnalysisInput {
  transcriptLines: string; // "[0.56s - 4.26s] texto..." por línea
  durationSec: number;
  desiredClipCount: number;
  minClipSeconds: number;
  maxClipSeconds: number;
  minQualityScore: number;
  language: string;
  priorityTopics: string | null;
  excludedTopics: string | null;
}

export interface CandidateSuggestion {
  startSec: number;
  endSec: number;
  score: number;
  category: string;
  reason: string;
  title: string;
  description: string;
  hashtags: string[];
}

export interface AnalysisResult {
  candidates: CandidateSuggestion[];
  summary: string;
  inputTokens: number;
  outputTokens: number;
}

export class ClaudeConfigError extends Error {}

const CANDIDATE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startSec: { type: "number", description: "Segundo exacto de inicio del fragmento" },
          endSec: { type: "number", description: "Segundo exacto de fin del fragmento" },
          score: {
            type: "integer",
            description: "Estimación de potencial de 0 a 100. Nunca una garantía de viralidad.",
          },
          category: {
            type: "string",
            description: "Una palabra: humor, historia, revelacion, debate, emocion, utilidad, sorpresa, etc.",
          },
          reason: {
            type: "string",
            description: "Motivo breve en español sencillo de por qué se seleccionó este fragmento.",
          },
          title: {
            type: "string",
            description: "Título corto sugerido para el clip, en español, atractivo pero honesto.",
          },
          description: {
            type: "string",
            description:
              "Descripción corta sugerida para publicar el clip (1-2 frases), en español, lista para copiar y pegar.",
          },
          hashtags: {
            type: "array",
            items: { type: "string" },
            description:
              "3 a 6 hashtags sugeridos (sin el símbolo #, solo la palabra), relevantes al contenido real del fragmento.",
          },
        },
        required: ["startSec", "endSec", "score", "category", "reason", "title", "description", "hashtags"],
        additionalProperties: false,
      },
    },
    summary: {
      type: "string",
      description:
        "Una o dos frases explicando, en español sencillo, por qué se eligieron (o no) estos momentos, y si el contenido ofrece pocos momentos de calidad, decirlo aquí explícitamente.",
    },
  },
  required: ["candidates", "summary"],
  additionalProperties: false,
} as const;

function buildSystemPrompt(input: AnalysisInput): string {
  return `Eres un editor de video experto en identificar momentos con potencial de captar atención dentro de transcripciones, para convertirlos en clips cortos para redes sociales (TikTok, Reels, Shorts).

Evalúa cada candidato según:
- Fuerza del inicio para captar atención de inmediato.
- Que se entienda sin haber visto el video original (claridad y contexto).
- Interés real: historia, revelación, explicación clara, debate, humor, sorpresa, emoción o utilidad práctica.
- Que tenga un inicio y un cierre coherentes (no corta una idea a la mitad).
- Que la duración quede entre ${input.minClipSeconds} y ${input.maxClipSeconds} segundos.
- Que cada candidato sea distinto a los demás (no repitas la misma idea dos veces).

Descarta: silencios, fragmentos sin contexto, cosas ya dichas, polémicas que solo tienen gritos sin contenido real.
${input.priorityTopics ? `Prioriza especialmente momentos relacionados con: ${input.priorityTopics}.` : ""}
${input.excludedTopics ? `NUNCA selecciones momentos relacionados con: ${input.excludedTopics}.` : ""}

Solo incluye candidatos con una puntuación estimada de ${input.minQualityScore} o más sobre 100. La puntuación es una ESTIMACIÓN de potencial, nunca una promesa de viralidad, visitas o ingresos.

Para cada candidato que sí incluyas, sugiere también una descripción corta para publicarlo y una lista de hashtags relevantes — deben reflejar el contenido real del fragmento, nunca genéricos ni inventados para parecer más atractivos de lo que son.

Si el contenido no tiene suficientes momentos de calidad, devuelve menos candidatos de los que se pidieron (o ninguno) y explica el motivo en "summary". NUNCA inventes o rellenes con fragmentos débiles solo para completar una cantidad.

El video dura ${input.durationSec.toFixed(1)} segundos en total. Se pidieron idealmente ${input.desiredClipCount} clips, pero esa es solo una meta, no una obligación.`;
}

/**
 * Analiza una transcripción completa y devuelve candidatos reales a clip,
 * usando la API de Claude con salida estructurada (output_config.format).
 */
export async function analyzeTranscript(input: AnalysisInput): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeConfigError(
      "Falta ANTHROPIC_API_KEY en .env.local — no se puede analizar sin ella."
    );
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    system: buildSystemPrompt(input),
    messages: [
      {
        role: "user",
        content: `Transcripción con marcas de tiempo (formato "[inicio - fin] texto"):\n\n${input.transcriptLines}`,
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: CANDIDATE_SCHEMA },
    },
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude no devolvió una respuesta de texto con los candidatos");
  }

  const parsed = JSON.parse(textBlock.text) as Omit<AnalysisResult, "inputTokens" | "outputTokens">;
  return {
    ...parsed,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
