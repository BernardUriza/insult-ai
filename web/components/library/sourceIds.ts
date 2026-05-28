import { newId } from "../../lib/id";

export function sourceIdFromName(name: string): string {
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 72);
  const base = slug || "source";
  return `${base}-${newId()}`.slice(0, 128);
}
