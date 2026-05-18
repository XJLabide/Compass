"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import clsx from "clsx";

import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

/**
 * In-app confirmation modal. Renders as a centered card over a dimmed
 * backdrop. Replaces `window.confirm()` calls so prompts match the app's
 * theme and don't trigger the OS-default alert UI.
 *
 * Controlled component — the parent owns `open` and handles open/close via
 * `onCancel` / `onConfirm` callbacks.
 */
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  /** Default "Confirm". Use this for the affirmative action verb ("Delete", "Discard"). */
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" turns the confirm button red; "default" keeps it accent-cyan. */
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc to cancel
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  useBodyScrollLock(open);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={description ? "confirm-desc" : undefined}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 p-5">
          <div
            className={clsx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
              tone === "danger"
                ? "bg-red-500/15 text-red-300"
                : "bg-accent/15 text-accent",
            )}
          >
            <AlertTriangle aria-hidden className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-title"
              className="text-sm font-semibold text-neutral-100"
            >
              {title}
            </h2>
            {description ? (
              <p
                id="confirm-desc"
                className="mt-1 text-xs leading-relaxed text-muted"
              >
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-neutral-900/40 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
            className={clsx(
              "h-9 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
              tone === "danger"
                ? "bg-red-500 text-white hover:brightness-110"
                : "bg-accent text-neutral-900 hover:brightness-110",
            )}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
