"use client";

import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { stripReceiptsTail } from "../roast/RoastText";

/** Render markdown content with GFM (tables, strikethrough, task lists).
 *
 * Ported from aurity (components/chat/MarkdownRenderer.tsx). The component
 * tree is the same — only the class names changed: aurity uses
 * `chat-md-*` semantic classes against its design system; here we inline
 * the Tailwind so MarkdownRenderer drops in without forcing a globals.css
 * edit. Keep the visual weight close to <RoastText> so a mixed thread
 * (some MD, some plain) doesn't read disjoint. */

const markdownComponents: Components = {
  // Headings — slight size bump per level, all bold + zinc-100.
  h1: ({ children }) => <h1 className="mt-3 mb-2 text-xl font-bold text-zinc-100">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-2 text-lg font-bold text-zinc-100">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2 mb-1.5 text-base font-bold text-zinc-100">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2 mb-1.5 text-sm font-bold text-zinc-200">{children}</h4>,
  p: ({ children }) => <p className="my-2 leading-relaxed text-zinc-100">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 text-zinc-100">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 text-zinc-100">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  code: ({ className, children, ...props }) => {
    const isInline = !className?.includes("language-");
    return isInline ? (
      <code
        className="rounded bg-iai-surface px-1.5 py-0.5 font-mono text-[0.9em] text-iai-accent"
        {...props}
      >
        {children}
      </code>
    ) : (
      <code
        className={`block overflow-x-auto rounded-lg border border-iai-border bg-iai-surface/60 p-3 font-mono text-xs text-zinc-100 ${className || ""}`}
        {...props}
      >
        {children}
      </code>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-4 border-iai-fire/60 bg-iai-surface/30 py-1 pl-4 italic text-zinc-300">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="iai-link break-words"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-4 border-iai-border" />,
  strong: ({ children }) => <strong className="iai-sententia">{children}</strong>,
  em: ({ children }) => <em className="text-zinc-200 italic">{children}</em>,
  // Table support (GFM). Wrap in an overflow div so wide tables don't
  // push the bubble width.
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-iai-border">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-iai-surface/60">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-t border-iai-border">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold text-zinc-200">{children}</th>
  ),
  td: ({ children }) => <td className="px-3 py-2 text-zinc-100">{children}</td>,
};

export function MarkdownRenderer({
  content,
  className = "",
  caret = false,
  stripReceipts = false,
}: {
  content: string;
  className?: string;
  caret?: boolean;
  stripReceipts?: boolean;
}) {
  const body = stripReceipts ? stripReceiptsTail(content) : content;

  return (
    <div className={`iai-roast ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {body}
      </ReactMarkdown>
      {caret && (
        <span
          aria-hidden
          className="ml-0.5 inline-block h-[1em] w-[0.45em] -mb-[0.15em] animate-pulse bg-iai-brand align-baseline"
        />
      )}
    </div>
  );
}
