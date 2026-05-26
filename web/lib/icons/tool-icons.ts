/**
 * Tool Icons — visual mapping for the chain-of-thought steps.
 *
 * Each ``Step`` in a chat message carries a raw tool ``name`` like
 * ``mcp__brightdata__scrape_as_markdown`` or ``Bash``. The ThinkingPanel
 * needs a small icon next to each. This module owns the classification:
 * what looks like a search vs a scrape vs a generic tool, with a sensible
 * default. Add new categories here (and only here) when fi-runner exposes
 * new tool surfaces.
 */

import {
  BookOpen,
  Cog,
  FileText,
  Globe,
  ListChecks,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Tool icon map — semantic category → lucide component. The category is
 * not the lucide name; ``Search`` could swap to ``ScanSearch`` without
 * touching consumers.
 */
export const TOOL_ICONS: Record<string, LucideIcon> = {
  search: Search, // SERP / search_engine / ToolSearch
  scrape: FileText, // scrape_as_markdown / scrape_as_html / fetch
  browser: Globe, // scraping_browser / web_unlocker
  rag: BookOpen, // search_documents / RAG store
  bash: Terminal, // built-in Bash
  introspect: ListChecks, // ListMcpResourcesTool / catalog discovery
  generic: Wrench, // fallback for unclassified tools
  config: Cog, // settings / config-ish
} as const;

/**
 * Classify a tool name into a category from :data:`TOOL_ICONS`.
 * The matching is deliberately loose (substring on lowercased name) so a
 * rename like ``scrape_as_markdown`` → ``scrape_markdown`` still resolves.
 */
export function classifyTool(name: string): keyof typeof TOOL_ICONS {
  const n = name.toLowerCase();
  if (n.includes("search")) return "search";
  if (n.includes("scrape") || n.includes("fetch") || n.includes("unlock")) return "scrape";
  if (n.includes("browser")) return "browser";
  if (n.includes("document") || n.includes("rag")) return "rag";
  if (n === "bash" || n.endsWith("__bash")) return "bash";
  if (n.includes("listmcp") || n.includes("listtool")) return "introspect";
  return "generic";
}

/** Convenience: classify + return the lucide component. */
export function getToolIcon(name: string): LucideIcon {
  return TOOL_ICONS[classifyTool(name)];
}

/** Strip the ``mcp__<server>__`` prefix for display (``scrape_as_markdown``). */
export function shortToolName(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}
