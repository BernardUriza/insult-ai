import { stepStatusKey } from "../../lib/icons";
import type { Step } from "./types";

export type ToolVisualStatus = "active" | "sent" | "done" | "error";

export function latestOpenToolIndex(steps: Step[]): number {
  return steps.reduce((latest, step, index) => (step.isError === null ? index : latest), -1);
}

export function toolVisualStatus(
  step: Step,
  index: number,
  latestOpenIndex: number,
  live: boolean,
): ToolVisualStatus {
  const raw = stepStatusKey(step.isError);
  if (raw === "error") return "error";
  if (raw === "done") return "done";
  if (!live) return "done";
  return index === latestOpenIndex ? "active" : "sent";
}

export function toolStatusLabel(status: ToolVisualStatus): string {
  return status;
}
