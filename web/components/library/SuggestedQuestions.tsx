"use client";

import Link from "next/link";
import type { Route } from "next";
import type { SuggestedQuestion } from "./types";

export function SuggestedQuestions({
  corpusId,
  questions,
}: {
  corpusId: string;
  questions: SuggestedQuestion[];
}) {
  if (questions.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      <span className="iai-hint text-[10px] uppercase tracking-wide">
        Suggested questions
      </span>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((suggestion) => (
          <Link
            key={suggestion.question}
            href={
              `/chat?mode=brief&corpus=${encodeURIComponent(
                corpusId,
              )}&seed=${encodeURIComponent(suggestion.question)}` as Route
            }
            className="group/question flex max-w-full items-center gap-2 rounded-lg border border-iai-border bg-iai-surface/35 p-1.5 pr-2 text-left text-[10px] text-zinc-300 transition hover:border-iai-fire/45 hover:bg-iai-surface/60 hover:text-white"
            title={suggestion.question}
          >
            {suggestion.image_url && (
              <img
                src={suggestion.image_url}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                className="h-9 w-9 shrink-0 rounded-md object-cover opacity-90"
              />
            )}
            <span className="min-w-0 flex-1 truncate">{suggestion.question}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
