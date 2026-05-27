"use client";

import { getStatusIcon, getUIIcon } from "../../lib/icons";
import { MarkdownRenderer } from "./MarkdownRenderer";

const FlameIcon = getUIIcon("brand");
const ForwardIcon = getUIIcon("forward");
const WarnIcon = getStatusIcon("warning");
const ErrorIcon = getStatusIcon("error");

/** Wire mirror of the Python ClinicalEnvelope (see
 * api/insult_ai/clinical_envelope.py:EnvelopeWire). Keep these aligned;
 * there's no codegen — the UI silently drops unknown fields and the
 * panel goes blank when they drift. */
export interface ClinicalEnvelopeData {
  safety_level: "normal" | "sensitive" | "crisis";
  tone: "soft" | "medium" | "spicy" | "no_insults";
  user_state_hypothesis: string;
  clinical_move:
    | "validation"
    | "reflection"
    | "cognitive_reframe"
    | "behavioral_activation"
    | "planning"
    | "boundary";
  roast_line: string | null;
  main_response: string;
  micro_action: string | null;
  follow_up_question: string | null;
}

/** Try to parse a clinical envelope out of a raw assistant content
 * string. Returns null if the content isn't an envelope (e.g. roast/brief
 * modes ship plain text). Tolerant of:
 *   - bare JSON
 *   - JSON wrapped in ```json … ``` fences
 *   - a JSON object embedded in a preamble (extracts first balanced {…})
 *
 * Mirrors the Python `_extract_json_object` in clinical_envelope.py — same
 * recovery rules so the UI never disagrees with the server on what was
 * a valid envelope. */
export function parseEnvelope(content: string): ClinicalEnvelopeData | null {
  const fence = /^```(?:json)?\s*|\s*```$/gm;
  const stripped = content.replace(fence, "").trim();
  if (!stripped.startsWith("{")) {
    // Find first balanced {...}
    let depth = 0;
    let start = -1;
    for (let i = 0; i < stripped.length; i++) {
      const c = stripped[i];
      if (c === "{") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (c === "}") {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          return tryParseObject(stripped.slice(start, i + 1));
        }
      }
    }
    return null;
  }
  return tryParseObject(stripped);
}

function tryParseObject(s: string): ClinicalEnvelopeData | null {
  try {
    const obj = JSON.parse(s);
    if (
      typeof obj === "object" &&
      obj !== null &&
      typeof obj.safety_level === "string" &&
      typeof obj.main_response === "string" &&
      typeof obj.clinical_move === "string"
    ) {
      return obj as ClinicalEnvelopeData;
    }
  } catch {
    /* ignore — caller treats null as "not an envelope" */
  }
  return null;
}

/** Render the envelope as the user-facing surface:
 *   - roast_line (if present) in fire accent
 *   - main_response as markdown
 *   - micro_action as a highlighted call-to-action
 *   - follow_up_question as a softer prompt
 *   - safety badge ONLY when level isn't normal (otherwise we don't paint
 *     the clinical labels at all — the persona is supposed to feel like
 *     a compa, not a hospital with a fake mustache).
 */
export function ClinicalEnvelopeView({
  env,
}: {
  env: ClinicalEnvelopeData;
}) {
  const isCrisis = env.safety_level === "crisis";
  const isSensitive = env.safety_level === "sensitive";

  return (
    <div className="flex flex-col gap-3">
      {/* Safety banner — only when escalated. Quiet, not alarming;
        * deliberate matter-of-factness. */}
      {(isCrisis || isSensitive) && (
        <div
          className={
            isCrisis
              ? "iai-error inline-flex items-center gap-2 text-sm"
              : "rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200 inline-flex items-center gap-2"
          }
        >
          {isCrisis ? (
            <ErrorIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
          ) : (
            <WarnIcon className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          )}
          {isCrisis ? (
            <span>El compadre soltó el personaje. Esto necesita un recurso real.</span>
          ) : (
            <span>El compadre bajó el tono — lo que cuentas pesa.</span>
          )}
        </div>
      )}

      {/* Roast line — only when present. Fire accent, italic, leading. */}
      {env.roast_line && (
        <div className="inline-flex items-start gap-2 text-iai-fire italic">
          <FlameIcon className="iai-flame h-4 w-4 mt-1 shrink-0" aria-hidden />
          <span className="font-medium leading-snug">{env.roast_line}</span>
        </div>
      )}

      {/* Main response — markdown rendered, same look as roast mode. */}
      <MarkdownRenderer content={env.main_response} />

      {/* Micro-action — highlighted box at the bottom so the user can't
        * miss "the one thing to do next." */}
      {env.micro_action && (
        <div className="rounded-lg border border-iai-fire/30 bg-iai-fire/5 p-3 text-sm">
          <div className="iai-hint mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-iai-fire">
            <ForwardIcon className="h-3 w-3" aria-hidden />
            siguiente acción
          </div>
          <div className="text-zinc-100 leading-relaxed">{env.micro_action}</div>
        </div>
      )}

      {/* Follow-up — quiet, separated. */}
      {env.follow_up_question && (
        <div className="iai-hint italic text-sm text-zinc-400">
          {env.follow_up_question}
        </div>
      )}
    </div>
  );
}

/** Dev-only trace panel — shows the envelope's structured fields. The
 * production UI hides this; toggle via `?trace=1` on the URL or a
 * `localStorage.insult_ai.show_trace = "1"`. */
export function ClinicalEnvelopeTrace({
  env,
}: {
  env: ClinicalEnvelopeData;
}) {
  return (
    <details className="mt-3 text-[10px] uppercase tracking-wider">
      <summary className="iai-hint cursor-pointer">cómo pensó el sistema</summary>
      <dl className="iai-hint mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 normal-case tracking-normal text-xs">
        <dt className="text-zinc-500">safety_level</dt>
        <dd className="text-zinc-300">{env.safety_level}</dd>
        <dt className="text-zinc-500">tone</dt>
        <dd className="text-zinc-300">{env.tone}</dd>
        <dt className="text-zinc-500">clinical_move</dt>
        <dd className="text-zinc-300">{env.clinical_move}</dd>
        <dt className="text-zinc-500">user_state</dt>
        <dd className="text-zinc-300">{env.user_state_hypothesis}</dd>
      </dl>
    </details>
  );
}
