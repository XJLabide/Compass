"use client";

import { useEffect } from "react";
import { ArrowLeftRight } from "lucide-react";

import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

/**
 * After a swap during edit, prompt the user: do they want to save this
 * swap to the program template for future sessions of the same kind?
 *
 * The parent queues these prompts sequentially when multiple swaps happened
 * in one edit pass — one swap → answer → next swap → answer → ...
 */
export interface SaveSwapPromptProps {
  open: boolean;
  fromName: string;
  toName: string;
  sessionName: string;
  busy?: boolean;
  onYes: () => void;
  onNo: () => void;
}

export default function SaveSwapPrompt({
  open,
  fromName,
  toName,
  sessionName,
  busy,
  onYes,
  onNo,
}: SaveSwapPromptProps) {
  useBodyScrollLock(open);

  // Esc dismisses as "No".
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onNo]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-swap-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 backdrop-blur p-4"
      onClick={busy ? undefined : onNo}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <ArrowLeftRight aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="save-swap-title"
              className="text-sm font-semibold text-neutral-100"
            >
              Save swap to program?
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Replace <span className="text-neutral-200">{fromName}</span> with{" "}
              <span className="text-neutral-200">{toName}</span> for future{" "}
              <span className="text-neutral-200">{sessionName}</span> sessions.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-neutral-900/40 px-4 py-3">
          <button
            type="button"
            onClick={onNo}
            disabled={busy}
            className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Just this session
          </button>
          <button
            type="button"
            onClick={onYes}
            disabled={busy}
            autoFocus
            className="h-9 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save to program"}
          </button>
        </div>
      </div>
    </div>
  );
}
