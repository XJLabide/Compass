"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import NoriChat from "@/components/nori/NoriChat";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

/**
 * Floating "Ask Nori" button + slide-in chat panel. Lives in the (app)
 * layout so it's available on every signed-in page.
 *
 * Click the button → opens an overlay with the chat. Esc / tap-outside /
 * dedicated close button all dismiss.
 */
export default function NoriPanel() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useBodyScrollLock(open);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Nori"
        title="Ask Nori"
        className="fixed bottom-36 right-4 z-30 flex h-12 items-center gap-2 rounded-full border border-accent/40 bg-neutral-900/90 px-4 text-xs font-semibold text-accent shadow-xl shadow-accent/10 backdrop-blur transition hover:bg-neutral-800/90 hover:shadow-accent/20 active:scale-95 md:bottom-24"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Ask Nori
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-md flex-col overflow-hidden border-l border-border bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <NoriChat onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
