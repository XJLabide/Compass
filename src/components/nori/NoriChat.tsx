"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  ArrowUp,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import {
  noriMessagesPath,
  noriThreadPath,
} from "@/lib/db/paths";
import type {
  NoriMessage,
  NoriToolCall,
} from "@/lib/db/types";
import { getFirebaseDb } from "@/lib/firebase";
import { executeTool, type ToolContext } from "@/lib/nori/executor";
import { findTool } from "@/lib/nori/tools";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

const DEFAULT_THREAD_ID = "default";

interface UiToolCall extends NoriToolCall {}

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: UiToolCall[];
  toolCallId?: string;
  createdAtMs?: number;
}

interface OpenAIMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

/**
 * Single-thread chat with Nori. Persists messages to Firestore so the chat
 * survives reloads and is the same surface from /nori and the floating panel.
 *
 * Flow:
 *   1. User submits prompt → write user message to Firestore.
 *   2. POST to /api/nori with the full message history.
 *   3. Server responds with assistant text + (maybe) tool_calls.
 *   4. Write the assistant message to Firestore (toolCalls.confirmed=false for writes).
 *   5. Read tools auto-execute → tool result messages persisted → another /api/nori turn.
 *   6. Write tools wait for user confirm → on confirm, execute → tool result → another turn.
 */
export default function NoriChat({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { uid, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const today = useMemo(() => computeLocalDate(new Date(), tz), [tz]);
  const currency = effectiveProfile?.currency ?? "USD";
  const unitImperial = effectiveProfile?.unitSystem !== "metric";

  const toolCtx = useMemo<ToolContext | null>(
    () =>
      uid
        ? {
            uid,
            db: getFirebaseDb(),
            timezone: tz,
            unitImperial,
            currency,
          }
        : null,
    [uid, tz, unitImperial, currency],
  );

  const [messages, setMessages] = useState<UiMessage[] | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to thread messages
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        noriMessagesPath(uid, DEFAULT_THREAD_ID),
        orderBy("createdAt", "asc"),
      ),
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              role: data.role,
              content: data.content,
              toolCalls: data.toolCalls,
              toolCallId: data.toolCallId,
              createdAtMs:
                (data.createdAt as unknown as { toMillis?: () => number })
                  ?.toMillis?.() ?? Date.now(),
            };
          }),
        );
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid]);

  // Autoscroll to bottom on new messages
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // -------------------------------------------------------------------------
  // Send turn → API → persist response → run auto tools (reads)
  // -------------------------------------------------------------------------
  const runTurn = useCallback(
    async (history: UiMessage[]) => {
      if (!uid) return;
      setSending(true);
      setError(null);
      try {
        const payload = {
          messages: history.map(messageToOpenAI),
          context: {
            displayName: effectiveProfile?.displayName ?? "",
            unitSystem: effectiveProfile?.unitSystem ?? "imperial",
            currency,
            timezone: tz,
            today,
          },
        };
        const res = await fetch("/api/nori", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          role: "assistant";
          content: string;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
        const toolCalls: UiToolCall[] | undefined = data.tool_calls?.map(
          (tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
            confirmed: !findTool(tc.function.name)?.isWrite,
            executed: false,
          }),
        );
        const assistantDoc: Record<string, unknown> = {
          threadId: DEFAULT_THREAD_ID,
          role: "assistant",
          content: data.content,
          createdAt: serverTimestamp(),
        };
        if (toolCalls && toolCalls.length > 0) {
          assistantDoc.toolCalls = toolCalls;
        }
        await addDoc(
          noriMessagesPath(uid, DEFAULT_THREAD_ID),
          assistantDoc as unknown as NoriMessage,
        );
        await touchThread(uid, history[history.length - 1]);

        // Auto-execute reads. Writes wait for user confirm.
        if (toolCalls && toolCalls.length > 0 && toolCtx) {
          for (const tc of toolCalls) {
            if (tc.confirmed && !tc.executed) {
              await executeAndPersist(uid, toolCtx, tc);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nori is unreachable.");
      } finally {
        setSending(false);
      }
    },
    [uid, tz, today, currency, effectiveProfile, toolCtx],
  );

  // After tool execution, fetch a follow-up turn so Nori can respond to the result.
  const runFollowUp = useCallback(async () => {
    if (!uid || !messages) return;
    await runTurn(messages);
  }, [uid, messages, runTurn]);

  // When the last message has all tool calls executed, trigger a follow-up.
  useEffect(() => {
    if (!messages || messages.length === 0 || sending) return;
    const last = messages[messages.length - 1];
    if (last.role !== "tool") return;
    void runFollowUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length]);

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------
  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || !uid || sending) return;
      setInput("");
      await addDoc(noriMessagesPath(uid, DEFAULT_THREAD_ID), {
        threadId: DEFAULT_THREAD_ID,
        role: "user",
        content: text,
        createdAt: serverTimestamp(),
      } as unknown as NoriMessage);
      const next: UiMessage = {
        id: "pending",
        role: "user",
        content: text,
      };
      await runTurn([...(messages ?? []), next]);
    },
    [input, uid, sending, messages, runTurn],
  );

  // -------------------------------------------------------------------------
  // Tool confirmation handler
  // -------------------------------------------------------------------------
  const handleConfirm = useCallback(
    async (msgId: string, call: UiToolCall, accept: boolean) => {
      if (!uid || !toolCtx) return;
      // 1. Mark the call confirmed/declined in the assistant message.
      const updatedCalls = (
        messages?.find((m) => m.id === msgId)?.toolCalls ?? []
      ).map((c) =>
        c.id === call.id
          ? { ...c, confirmed: accept, executed: false }
          : c,
      );
      const updatedDoc: Record<string, unknown> = {
        toolCalls: updatedCalls,
      };
      await setDoc(
        noriMessagesPath(uid, DEFAULT_THREAD_ID).firestore
          ? noriMessagePathDoc(uid, msgId)
          : noriMessagePathDoc(uid, msgId),
        updatedDoc,
        { merge: true },
      );
      // 2. If accepted, execute and persist the tool result.
      if (accept) {
        await executeAndPersist(uid, toolCtx, {
          ...call,
          confirmed: true,
        });
      } else {
        // User declined — persist a "declined" tool result so the LLM knows.
        await addDoc(noriMessagesPath(uid, DEFAULT_THREAD_ID), {
          threadId: DEFAULT_THREAD_ID,
          role: "tool",
          content: JSON.stringify({ ok: false, error: "User declined." }),
          toolCallId: call.id,
          createdAt: serverTimestamp(),
        } as unknown as NoriMessage);
      }
    },
    [uid, toolCtx, messages],
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h1 className="text-sm font-semibold tracking-tight text-neutral-100">
            Nori
          </h1>
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted">
            Compass AI
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Nori"
            className="rounded-md p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {messages === null ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-10 w-3/4 ml-auto" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        ) : messages.length === 0 ? (
          <EmptyHints onPick={setInput} />
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              m={m}
              onConfirm={(call, accept) => handleConfirm(m.id, call, accept)}
            />
          ))
        )}
        {sending ? (
          <div className="flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            Nori is thinking…
          </div>
        ) : null}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {error}
          </div>
        ) : null}
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border bg-neutral-900/40 px-3 py-2"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder="Ask Nori anything about your day…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-border bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
            disabled={sending}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-neutral-900 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bubbles, hints, helpers
// ---------------------------------------------------------------------------
function MessageBubble({
  m,
  onConfirm,
}: {
  m: UiMessage;
  onConfirm: (call: UiToolCall, accept: boolean) => void;
}) {
  if (m.role === "tool") {
    // Hidden by default — the LLM uses tool results internally; we don't
    // need to show raw JSON to the user. Could render a compact "ran X" line.
    return null;
  }
  const isUser = m.role === "user";
  return (
    <div
      className={clsx(
        "flex",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
          isUser
            ? "bg-accent/15 text-neutral-100"
            : "bg-neutral-900/60 text-neutral-100 border border-border",
        )}
      >
        {m.content ? <p className="whitespace-pre-wrap">{m.content}</p> : null}
        {m.toolCalls && m.toolCalls.length > 0 ? (
          <div className="mt-2 space-y-1.5">
            {m.toolCalls.map((tc) => (
              <ToolCallCard
                key={tc.id}
                call={tc}
                onConfirm={(accept) => onConfirm(tc, accept)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToolCallCard({
  call,
  onConfirm,
}: {
  call: UiToolCall;
  onConfirm: (accept: boolean) => void;
}) {
  const def = findTool(call.name);
  const isWrite = def?.isWrite ?? false;
  const args = (() => {
    try {
      return JSON.parse(call.arguments) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();

  // Reads: just a tiny pill confirming what's being looked up.
  if (!isWrite) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] text-muted">
        <Sparkles className="h-3 w-3 text-accent" />
        <span>Reading: {def?.name ?? call.name}</span>
      </div>
    );
  }

  // Writes: confirm card.
  const handled = call.confirmed === true || call.confirmed === false;
  if (call.executed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        <span>Done: {def?.confirmLabel ?? def?.name ?? call.name}</span>
      </div>
    );
  }
  if (handled && call.confirmed === false) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] text-muted">
        <X className="h-3 w-3" />
        <span>Skipped: {def?.confirmLabel ?? call.name}</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-amber-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
          {def?.confirmLabel ?? call.name}
        </span>
      </div>
      <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-relaxed text-neutral-300">
        {Object.entries(args).map(([k, v]) => (
          <div key={k}>
            <span className="text-muted">{k}: </span>
            {typeof v === "string" ? v : JSON.stringify(v)}
          </div>
        ))}
      </pre>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onConfirm(false)}
          className="h-7 rounded-md border border-border bg-neutral-900 px-2 text-[10px] font-medium text-muted hover:text-neutral-200"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onConfirm(true)}
          className="h-7 flex-1 rounded-md bg-accent px-2 text-[10px] font-semibold text-neutral-900 hover:brightness-110"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function EmptyHints({ onPick }: { onPick: (text: string) => void }) {
  const hints = [
    "What's on my plate today?",
    "How am I doing against my food budget?",
    "Log $5 for coffee",
    "What's my current streak?",
    "Add a todo: book dentist",
    "Did I check in yesterday?",
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Try one of these to get started:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {hints.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onPick(h)}
            className="rounded-full border border-border bg-neutral-900 px-3 py-1.5 text-[11px] text-neutral-200 hover:border-accent/40 hover:text-accent"
          >
            {h}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function messageToOpenAI(m: UiMessage): OpenAIMessage {
  const base: OpenAIMessage = {
    role: m.role,
    content: m.content ?? "",
  };
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    // Only include tool_calls that have been executed (or skipped) — pending
    // ones haven't gone back to the LLM yet. For simplicity we include all
    // calls; the LLM tolerates "pending" but won't see a matching tool result
    // until the user confirms.
    base.tool_calls = m.toolCalls.map((c) => ({
      id: c.id,
      type: "function" as const,
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  if (m.role === "tool" && m.toolCallId) {
    base.tool_call_id = m.toolCallId;
  }
  return base;
}

function noriMessagePathDoc(uid: string, messageId: string) {
  const path = noriMessagesPath(uid, DEFAULT_THREAD_ID);
  const { doc } = require("firebase/firestore") as typeof import("firebase/firestore");
  return doc(path, messageId);
}

async function touchThread(uid: string, last: UiMessage | undefined) {
  try {
    await setDoc(
      noriThreadPath(uid, DEFAULT_THREAD_ID),
      {
        title:
          (last?.content ?? "Chat with Nori").slice(0, 80) || "Chat with Nori",
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      } as unknown as Record<string, unknown>,
      { merge: true },
    );
  } catch {
    /* best-effort */
  }
}

async function executeAndPersist(
  uid: string,
  ctx: ToolContext,
  call: UiToolCall,
) {
  const result = await executeTool(ctx, {
    name: call.name,
    arguments: call.arguments,
    confirmed: call.confirmed === true,
  });
  // Mark the original call as executed so the UI flips to "Done".
  // (We don't update the assistant doc here; the success badge keys off the
  // tool result message's existence.)
  await addDoc(noriMessagesPath(uid, DEFAULT_THREAD_ID), {
    threadId: DEFAULT_THREAD_ID,
    role: "tool",
    content: result,
    toolCallId: call.id,
    createdAt: serverTimestamp(),
  } as unknown as NoriMessage);
}
