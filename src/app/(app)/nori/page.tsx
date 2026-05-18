"use client";

import { useCallback, useEffect, useState } from "react";

import { useUserData } from "@/lib/data/UserDataProvider";
import NoriChat, { DEFAULT_THREAD_ID } from "@/components/nori/NoriChat";
import ThreadList from "@/components/nori/ThreadList";

const STORAGE_KEY = "compass.nori.activeThread";

/**
 * `/nori` — full chat with ChatGPT-style thread sidebar.
 *
 * Active thread id is persisted in localStorage so navigation between pages
 * (and the floating panel) lands you back in the same conversation.
 */
export default function NoriPage() {
  const { uid } = useUserData();
  const [activeThreadId, setActiveThreadId] = useState<string>(
    DEFAULT_THREAD_ID,
  );

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveThreadId(stored);
  }, []);

  const persistActive = useCallback((id: string) => {
    setActiveThreadId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const handleNewChat = useCallback(() => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `thread_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;
    persistActive(id);
  }, [persistActive]);

  if (!uid) return null;

  return (
    <section className="grid h-[calc(100dvh-7rem)] grid-cols-1 overflow-hidden rounded-xl border border-border bg-neutral-900/40 md:h-[calc(100dvh-6rem)] md:grid-cols-[260px_1fr]">
      <div className="hidden md:block">
        <ThreadList
          uid={uid}
          activeThreadId={activeThreadId}
          onSelect={persistActive}
          onNew={handleNewChat}
        />
      </div>
      <NoriChat threadId={activeThreadId} />
    </section>
  );
}
