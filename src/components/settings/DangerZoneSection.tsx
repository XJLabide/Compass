"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { useAuth } from "@/lib/auth/useAuth";
import { wipeAllUserData } from "@/lib/data/wipeAll";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Settings section for irreversible account actions. Currently:
 *   - Delete everything: wipes all Firestore data under users/{uid}/...
 *     and signs the user out. On next sign-in, the seed runs fresh so
 *     they re-onboard from a clean slate.
 *
 * Two-tap confirm via ConfirmDialog. The destructive button uses the danger
 * tone + an explicit "delete everything" verb so it's never confused with
 * a less-final action like "sign out".
 */
export default function DangerZoneSection() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!user?.uid) return;
    setBusy(true);
    setError(null);
    setProgress("Wiping your data…");
    try {
      const report = await wipeAllUserData(user.uid);
      setProgress(`Removed ${report.total} document${report.total === 1 ? "" : "s"}. Signing out…`);
      await signOut();
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete your data.",
      );
      setBusy(false);
      setProgress(null);
    }
  }, [user?.uid, signOut, router]);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted">
        Permanently removes every todo, expense, routine, workout, check-in,
        and Nori thread under your account. You&apos;ll be signed out and the
        app will treat you as a brand-new user on next sign-in. This cannot
        be undone.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 text-xs font-semibold text-red-300 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete everything
      </button>

      {progress ? (
        <p className="text-[11px] text-muted">{progress}</p>
      ) : null}
      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <ConfirmDialog
        open={open}
        tone="danger"
        title="Delete everything?"
        description="Every todo, expense, routine, workout, check-in, and Nori chat will be permanently deleted. This can't be undone."
        confirmLabel="Yes, delete it all"
        busy={busy}
        onConfirm={handleConfirm}
        onCancel={() => (busy ? undefined : setOpen(false))}
      />
    </div>
  );
}
