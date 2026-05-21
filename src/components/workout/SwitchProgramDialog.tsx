"use client";

import { useEffect, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { Check, LayoutGrid } from "lucide-react";
import clsx from "clsx";

import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import { PROGRAM_TEMPLATES } from "@/lib/data/programTemplates";
import { programPath } from "@/lib/db/paths";
import type { ProgramDoc } from "@/lib/db/types";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

interface Props {
  uid: string;
  onClose: () => void;
  /** Called after the program is successfully written so the editor can refresh. */
  onApplied: () => void;
}

type Selection = string | "__blank__";

/**
 * Modal that lets the user pick one of the built-in program templates (or
 * start blank) and replaces their current program in Firestore.
 *
 * Flow:
 *  1. User picks a template card or "Start blank".
 *  2. User clicks Apply.
 *  3. ConfirmDialog warns that in-progress sessions won't be affected.
 *  4. On confirm, we write the new program doc (full overwrite, no merge).
 *  5. Dialog closes and parent is notified.
 */
export default function SwitchProgramDialog({ uid, onClose, onApplied }: Props) {
  const [selected, setSelected] = useState<Selection>("upper-lower");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll while picker is open (ConfirmDialog does its own lock too).
  useBodyScrollLock(true);

  // Esc to close (when confirm dialog is not open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirmOpen && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, busy, onClose]);

  const handleApply = () => {
    setError(null);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      let doc: ProgramDoc;
      if (selected === "__blank__") {
        doc = {
          name: "My Program",
          sessions: [{ id: `session-${Date.now().toString(36)}`, name: "Day 1", exercises: [] }],
          createdAt: serverTimestamp() as unknown as ProgramDoc["createdAt"],
          updatedAt: serverTimestamp() as unknown as ProgramDoc["updatedAt"],
        };
      } else {
        const template = PROGRAM_TEMPLATES.find((t) => t.id === selected);
        if (!template) throw new Error("Unknown template");
        doc = {
          name: template.name,
          sessions: template.sessions,
          createdAt: serverTimestamp() as unknown as ProgramDoc["createdAt"],
          updatedAt: serverTimestamp() as unknown as ProgramDoc["updatedAt"],
        };
      }
      // Full overwrite — clears old schedule and sessions.
      await setDoc(programPath(uid), doc, { merge: false });
      setConfirmOpen(false);
      onApplied();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply template");
      setBusy(false);
    }
  };

  return (
    <>
      {/* Picker backdrop + sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Switch program"
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 backdrop-blur sm:items-center p-4"
        onClick={busy ? undefined : onClose}
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
            <LayoutGrid className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-neutral-100">Switch program</h2>
          </div>

          {/* Template cards */}
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
            {PROGRAM_TEMPLATES.map((t) => {
              const isSelected = selected === t.id;
              const dayLabels = t.sessions.map((s) => s.name).join(", ");
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={clsx(
                    "w-full rounded-xl border px-3.5 py-3 text-left transition",
                    isSelected
                      ? "border-accent bg-accent/10"
                      : "border-border bg-neutral-900/40 hover:border-neutral-600 hover:bg-neutral-900/60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-neutral-100">{t.name}</p>
                      <p className="mt-0.5 text-[11px] text-muted">{t.description}</p>
                    </div>
                    <div
                      className={clsx(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                        isSelected
                          ? "border-accent bg-accent text-neutral-900"
                          : "border-border bg-transparent",
                      )}
                    >
                      {isSelected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-muted/80 truncate">
                    {t.sessions.length} sessions · {dayLabels}
                  </p>
                </button>
              );
            })}

            {/* Start blank */}
            <button
              type="button"
              onClick={() => setSelected("__blank__")}
              className={clsx(
                "w-full rounded-xl border px-3.5 py-3 text-left transition",
                selected === "__blank__"
                  ? "border-accent bg-accent/10"
                  : "border-border border-dashed bg-transparent hover:border-neutral-600 hover:bg-neutral-900/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-neutral-100">Start blank</p>
                  <p className="mt-0.5 text-[11px] text-muted">Empty program — build it yourself</p>
                </div>
                <div
                  className={clsx(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                    selected === "__blank__"
                      ? "border-accent bg-accent text-neutral-900"
                      : "border-border bg-transparent",
                  )}
                >
                  {selected === "__blank__" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                </div>
              </div>
            </button>
          </div>

          {/* Error */}
          {error ? (
            <div className="mx-3 mb-1 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border bg-neutral-900/40 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation step */}
      <ConfirmDialog
        open={confirmOpen}
        title="Replace current program?"
        description={
          `This will overwrite your existing sessions and schedule. ` +
          `Any in-progress session will keep working but won't match the new program structure.`
        }
        confirmLabel="Yes, switch"
        busy={busy}
        onConfirm={handleConfirm}
        onCancel={() => (busy ? undefined : setConfirmOpen(false))}
      />
    </>
  );
}
