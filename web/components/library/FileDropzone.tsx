"use client";

import { type DragEvent, useCallback, useRef, useState } from "react";
import { getStatusIcon, getUIIcon } from "../../lib/icons";

const UploadIcon = getUIIcon("new"); // Sparkles — closest "upload" affordance in the curated set
const DoneIcon = getStatusIcon("done");
const WarnIcon = getStatusIcon("warning");

const ACCEPT = ".txt,.md";

/** Port of aurity's DocumentUploadModal dropzone — essence only.
 *
 *  Aurity ships a full modal with persona assignment, usage instructions,
 *  and an icon-rich UI. Insult AI's corpus model has none of those concepts
 *  (one corpus_id, one doc_id, one text blob), so the modal would be empty
 *  chrome. What we keep is the dropzone interaction itself: a single zone
 *  that handles both click-to-pick and drag-and-drop, with the same three
 *  visual states (idle / dragging / file-selected). Auto-fills nothing —
 *  the page owns the corpus_id; this component is just the file picker.
 *
 *  Validation is duplicated on purpose: useLibrary also checks the
 *  extension server-side. Two-sided check keeps the error visible before
 *  the round-trip, but never trusts the client. */
export function FileDropzone({
  onFile,
  disabled = false,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localError, setLocalError] = useState<string>("");

  const validate = useCallback((file: File): boolean => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
      setLocalError(`only .txt and .md supported (got ${file.name})`);
      return false;
    }
    setLocalError("");
    return true;
  }, []);

  const handleFile = (file: File) => {
    if (validate(file)) onFile(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onPick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={onPick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick();
          }
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iai-fire",
          isDragging
            ? "border-iai-fire bg-iai-fire/10"
            : "border-iai-border bg-iai-surface/30 hover:border-iai-fire/40 hover:bg-iai-surface/50",
          disabled ? "pointer-events-none opacity-50" : "",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset so re-picking the SAME file fires onChange again.
            e.target.value = "";
            if (file) handleFile(file);
          }}
        />
        {isDragging ? (
          <>
            <DoneIcon className="h-6 w-6 text-iai-fire" aria-hidden />
            <p className="text-sm font-medium text-zinc-100">Drop the file</p>
          </>
        ) : (
          <>
            <UploadIcon className="h-6 w-6 text-zinc-400" aria-hidden />
            <p className="text-sm font-medium text-zinc-100">
              Drop a file or click to pick
            </p>
            <p className="iai-hint text-xs">.txt or .md · up to 5 MB</p>
          </>
        )}
      </div>
      {localError && (
        <div className="iai-error inline-flex items-center gap-2 text-sm">
          <WarnIcon className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
          {localError}
        </div>
      )}
    </div>
  );
}
