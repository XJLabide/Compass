"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  deleteDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
} from "firebase/firestore";
import {
  MessageSquarePlus,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import clsx from "clsx";

import {
  noriMessagesPath,
  noriMessagePath,
  noriThreadPath,
  noriThreadsPath,
} from "@/lib/db/paths";
import type { NoriThread } from "@/lib/db/types";
import { getFirebaseDb } from "@/lib/firebase";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

export interface ThreadRow {
  id: string;
  data: NoriThread;
}

interface ThreadListProps {
  uid: string;
  activeThreadId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  /** Visible class — collapse the inner list on small viewports if false. */
  className?: string;
}

/**
 * Sidebar listing all of the user's Nori chat threads, newest first.
 * Provides "New chat" + per-row delete (with confirm). Tap a row to switch
 * the active thread.
 */
export default function ThreadList({
  uid,
  activeThreadId,
  onSelect,
  onNew,
  className,
}: ThreadListProps) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ThreadRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(noriThreadsPath(uid), orderBy("lastMessageAt", "desc")),
      (snap) =>
        setThreads(
          snap.docs.map((d) => ({ id: d.id, data: d.data() as NoriThread })),
        ),
      () => setThreads([]),
    );
    return () => unsub();
  }, [uid]);

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const db = getFirebaseDb();
      // Delete all messages first, then the thread doc.
      const msgs = await getDocs(noriMessagesPath(uid, pendingDelete.id));
      // Use writeBatch for atomicity (caps at 500 — fine for any reasonable chat).
      while (msgs.docs.length > 0) {
        const chunk = msgs.docs.splice(0, 400);
        const batch = writeBatch(db);
        for (const d of chunk) {
          batch.delete(noriMessagePath(uid, pendingDelete.id, d.id));
        }
        await batch.commit();
      }
      await deleteDoc(noriThreadPath(uid, pendingDelete.id));
      // If we deleted the active thread, swap to the most recent remaining.
      if (pendingDelete.id === activeThreadId) {
        const remaining = (threads ?? []).filter(
          (t) => t.id !== pendingDelete.id,
        );
        if (remaining.length > 0) {
          onSelect(remaining[0].id);
        } else {
          onNew();
        }
      }
      setPendingDelete(null);
    } catch {
      /* leave the dialog open with a generic state */
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, uid, activeThreadId, threads, onSelect, onNew]);

  return (
    <aside
      className={clsx(
        "flex h-full w-full flex-col overflow-hidden border-r border-border bg-neutral-900/40",
        className,
      )}
    >
      <header className="border-b border-border p-2">
        <button
          type="button"
          onClick={onNew}
          className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-neutral-900 px-2.5 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 text-accent" />
          New chat
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-1.5">
        {threads === null ? (
          <ul className="space-y-1">
            <li className="h-10 animate-pulse rounded-md bg-neutral-800/40" />
            <li className="h-10 animate-pulse rounded-md bg-neutral-800/40" />
            <li className="h-10 animate-pulse rounded-md bg-neutral-800/40" />
          </ul>
        ) : threads.length === 0 ? (
          <p className="px-2 py-4 text-[11px] text-muted">
            No chats yet. Start one above.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {threads.map((t) => {
              const active = t.id === activeThreadId;
              return (
                <li key={t.id}>
                  <div
                    className={clsx(
                      "group flex items-center gap-2 rounded-md px-2 py-1.5",
                      active
                        ? "bg-accent/10 text-accent"
                        : "text-neutral-200 hover:bg-neutral-800/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span className="truncate text-xs">
                        {t.data.title || "New chat"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(t)}
                      aria-label="Delete chat"
                      className="rounded p-1 text-muted opacity-60 transition-opacity hover:bg-red-500/10 hover:text-red-300 hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        tone="danger"
        title="Delete this chat?"
        description="The conversation and all its messages will be removed. This can't be undone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </aside>
  );
}
