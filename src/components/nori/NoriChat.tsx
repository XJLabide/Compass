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
  doc,
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
import {
  statusForTool,
  STATUS_THINKING,
} from "@/lib/nori/statusLabels";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import NoriMarkdown from "@/components/nori/NoriMarkdown";

export const DEFAULT_THREAD_ID = "default";

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

interface StreamingState {
  content: string;
  toolCalls: Map<number, { id: string; name: string; arguments: string }>;
  status: string;
}

/** Short label shown inside the assistant bubble next to a read-tool icon. */
const READ_LABEL: Record<string, string> = {
  list_todos: "Reading todos",
  list_routines: "Reading routines",
  list_expenses: "Reading expenses",
  get_check_in: "Reading check-in",
  list_recent_workouts: "Reading workouts",
  summary: "Building summary",
};
function readLabel(name: string): string {
  return READ_LABEL[name] ?? `Reading ${name.replace(/_/g, " ")}`;
}

/**
 * Single-thread chat with Nori. Consumes the SSE stream from /api/nori,
 * appends content deltas to a live assistant bubble, and surfaces a status
 * pill ("Thinking…" → "Reading expenses…" → result). Markdown rendering
 * via react-markdown.
 */
export default function NoriChat({
  onClose,
  threadId = DEFAULT_THREAD_ID,
}: {
  onClose?: () => void;
  threadId?: string;
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
  const [streaming, setStreaming] = useState<StreamingState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Subscribe to thread messages
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(
        noriMessagesPath(uid, threadId),
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
  }, [uid, threadId]);

  // Autoscroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming, status]);

  // -------------------------------------------------------------------------
  // Run a turn: stream from /api/nori, persist, auto-run reads.
  // -------------------------------------------------------------------------
  const runTurn = useCallback(
    async (history: UiMessage[]) => {
      if (!uid) return;
      setError(null);
      setStatus(STATUS_THINKING);
      const stream: StreamingState = {
        content: "",
        toolCalls: new Map(),
        status: STATUS_THINKING,
      };
      setStreaming(stream);

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
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        await consumeStream(res.body, (delta) => {
          if (delta.contentDelta) {
            stream.content += delta.contentDelta;
            if (stream.status === STATUS_THINKING) {
              stream.status = "";
              setStatus(null);
            }
            setStreaming({ ...stream, toolCalls: new Map(stream.toolCalls) });
          }
          if (delta.toolCallDelta) {
            const idx = delta.toolCallDelta.index;
            const existing = stream.toolCalls.get(idx) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (delta.toolCallDelta.id) existing.id = delta.toolCallDelta.id;
            if (delta.toolCallDelta.name)
              existing.name = delta.toolCallDelta.name;
            if (delta.toolCallDelta.argumentsDelta)
              existing.arguments += delta.toolCallDelta.argumentsDelta;
            stream.toolCalls.set(idx, existing);
            if (existing.name) {
              stream.status = statusForTool(existing.name);
              setStatus(stream.status);
            }
            setStreaming({ ...stream, toolCalls: new Map(stream.toolCalls) });
          }
        });

        const finalToolCalls: UiToolCall[] = Array.from(
          stream.toolCalls.values(),
        )
          .filter((tc) => tc.name)
          .map((tc) => {
            const isWrite = Boolean(findTool(tc.name)?.isWrite);
            // For reads, mark confirmed=true so the executor auto-runs them.
            // For writes, OMIT the confirmed field entirely — `false` means
            // explicit user decline, and `undefined` (missing) means pending.
            // Firestore rejects undefined values so we build conditionally.
            const base: UiToolCall = {
              id: tc.id || `call_${Math.random().toString(36).slice(2)}`,
              name: tc.name,
              arguments: tc.arguments || "{}",
              executed: false,
            };
            if (!isWrite) base.confirmed = true;
            return base;
          });

        const assistantDoc: Record<string, unknown> = {
          threadId,
          role: "assistant",
          content: stream.content,
          createdAt: serverTimestamp(),
        };
        if (finalToolCalls.length > 0)
          assistantDoc.toolCalls = finalToolCalls;
        await addDoc(
          noriMessagesPath(uid, threadId),
          assistantDoc as unknown as NoriMessage,
        );
        // Use the most recent USER message for the thread title — never a
        // tool-result JSON (which would otherwise become the title on the
        // follow-up turn after a tool fires).
        const lastUserMsg = [...history].reverse().find(
          (m) => m.role === "user",
        );
        await touchThread(uid, threadId, lastUserMsg);

        if (finalToolCalls.length > 0 && toolCtx) {
          for (const tc of finalToolCalls) {
            if (tc.confirmed) {
              setStatus(statusForTool(tc.name));
              await executeAndPersist(uid, threadId, toolCtx, tc);
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nori is unreachable.");
      } finally {
        setStreaming(null);
        setStatus(null);
      }
    },
    [uid, threadId, tz, today, currency, effectiveProfile, toolCtx],
  );

  // Follow-up turn after a tool result lands.
  useEffect(() => {
    if (!messages || messages.length === 0 || streaming) return;
    const last = messages[messages.length - 1];
    if (last.role !== "tool") return;
    void runTurn(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || !uid || streaming) return;
      setInput("");
      await addDoc(noriMessagesPath(uid, threadId), {
        threadId,
        role: "user",
        content: text,
        createdAt: serverTimestamp(),
      } as unknown as NoriMessage);
      const next: UiMessage = { id: "pending", role: "user", content: text };
      await runTurn([...(messages ?? []), next]);
    },
    [input, uid, threadId, streaming, messages, runTurn],
  );

  const handleConfirm = useCallback(
    async (msgId: string, call: UiToolCall, accept: boolean) => {
      if (!uid || !toolCtx) return;
      const updatedCalls = (
        messages?.find((m) => m.id === msgId)?.toolCalls ?? []
      ).map((c) =>
        c.id === call.id ? { ...c, confirmed: accept, executed: false } : c,
      );
      await setDoc(
        doc(noriMessagesPath(uid, threadId), msgId),
        { toolCalls: updatedCalls },
        { merge: true },
      );
      if (accept) {
        setStatus(statusForTool(call.name));
        await executeAndPersist(uid, threadId, toolCtx, {
          ...call,
          confirmed: true,
        });
        setStatus(null);
      } else {
        await addDoc(noriMessagesPath(uid, threadId), {
          threadId,
          role: "tool",
          content: JSON.stringify({ ok: false, error: "User declined." }),
          toolCallId: call.id,
          createdAt: serverTimestamp(),
        } as unknown as NoriMessage);
      }
    },
    [uid, threadId, toolCtx, messages],
  );

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
        ) : messages.length === 0 && !streaming ? (
          <EmptyHints onPick={setInput} />
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                onConfirm={(call, accept) => handleConfirm(m.id, call, accept)}
              />
            ))}
            {streaming && (streaming.content || streaming.toolCalls.size > 0) ? (
              <StreamingBubble streaming={streaming} />
            ) : null}
          </>
        )}

        {(status || streaming) && !error ? (
          <StatusPill text={status ?? STATUS_THINKING} />
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
            disabled={Boolean(streaming)}
          />
          <button
            type="submit"
            disabled={Boolean(streaming) || !input.trim()}
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
function MessageBubble({
  m,
  onConfirm,
}: {
  m: UiMessage;
  onConfirm: (call: UiToolCall, accept: boolean) => void;
}) {
  if (m.role === "tool") return null;
  const isUser = m.role === "user";
  return (
    <div className={clsx("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[85%] rounded-2xl px-3 py-2",
          isUser
            ? "bg-accent/15 text-neutral-100"
            : "bg-neutral-900/60 text-neutral-100 border border-border",
        )}
      >
        {m.content ? (
          isUser ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {m.content}
            </p>
          ) : (
            <NoriMarkdown>{m.content}</NoriMarkdown>
          )
        ) : null}
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

function StreamingBubble({ streaming }: { streaming: StreamingState }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl border border-border bg-neutral-900/60 px-3 py-2 text-neutral-100">
        {streaming.content ? (
          <NoriMarkdown>{streaming.content}</NoriMarkdown>
        ) : null}
        {streaming.toolCalls.size > 0 ? (
          <div className="mt-2 space-y-1.5">
            {[...streaming.toolCalls.values()].map((tc) => {
              const def = findTool(tc.name);
              if (!def) return null;
              return (
                <div
                  key={tc.id || tc.name}
                  className={clsx(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px]",
                    def.isWrite
                      ? "border-amber-400/40 bg-amber-400/5 text-amber-200"
                      : "border-border bg-neutral-900 text-muted",
                  )}
                >
                  <Sparkles className="h-3 w-3 text-accent" />
                  <span>
                    {def.isWrite
                      ? `Preparing ${def.confirmLabel ?? def.name}`
                      : readLabel(tc.name)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {!streaming.content && streaming.toolCalls.size === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            …
          </span>
        ) : null}
      </div>
    </div>
  );
}

function StatusPill({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      <span>{text}</span>
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

  // Reads: friendly inline pill (no underscores, no raw tool name).
  if (!isWrite) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] text-muted">
        <Sparkles className="h-3 w-3 text-accent" />
        <span>{readLabel(call.name)}</span>
      </div>
    );
  }

  if (call.executed) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        <span>Done · {def?.confirmLabel ?? def?.name ?? call.name}</span>
      </div>
    );
  }
  if (call.confirmed === false) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] text-muted">
        <X className="h-3 w-3" />
        <span>Skipped · {def?.confirmLabel ?? call.name}</span>
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
      <div className="mt-1.5 max-h-32 overflow-auto text-[10px] leading-relaxed text-neutral-300">
        {Object.entries(args).map(([k, v]) => (
          <div key={k}>
            <span className="text-muted">{k}: </span>
            {typeof v === "string" ? v : JSON.stringify(v)}
          </div>
        ))}
      </div>
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
      <p className="text-xs text-muted">Try one of these to get started:</p>
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
// SSE stream parsing
// ---------------------------------------------------------------------------
interface DeltaEvent {
  contentDelta?: string;
  toolCallDelta?: {
    index: number;
    id?: string;
    name?: string;
    argumentsDelta?: string;
  };
}

async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (d: DeltaEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      if (!raw) continue;
      const dataLine = raw
        .split("\n")
        .find((l) => l.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!dataLine) continue;
      if (dataLine === "[DONE]") return;
      let parsed: {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
        }>;
      };
      try {
        parsed = JSON.parse(dataLine);
      } catch {
        continue;
      }
      const delta = parsed.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.content === "string" && delta.content.length > 0) {
        onDelta({ contentDelta: delta.content });
      }
      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const fn = tc.function ?? {};
          onDelta({
            toolCallDelta: {
              index: tc.index ?? 0,
              id: tc.id,
              name: fn.name,
              argumentsDelta: fn.arguments,
            },
          });
        }
      }
    }
  }
}

function messageToOpenAI(m: UiMessage): OpenAIMessage {
  const base: OpenAIMessage = { role: m.role, content: m.content ?? "" };
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
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

async function touchThread(
  uid: string,
  threadId: string,
  recentUserMessage: UiMessage | undefined,
) {
  try {
    // Always bump lastMessageAt + ensure createdAt is set on first write.
    const patch: Record<string, unknown> = {
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    // Title comes from the most recent user message. If none yet (shouldn't
    // happen in practice, but guard for follow-up-only turns), leave the
    // existing title alone.
    if (recentUserMessage?.content) {
      patch.title =
        recentUserMessage.content.slice(0, 80) || "Chat with Nori";
    }
    await setDoc(noriThreadPath(uid, threadId), patch, { merge: true });
  } catch {
    /* best-effort */
  }
}

async function executeAndPersist(
  uid: string,
  threadId: string,
  ctx: ToolContext,
  call: UiToolCall,
) {
  const result = await executeTool(ctx, {
    name: call.name,
    arguments: call.arguments,
    confirmed: call.confirmed === true,
  });
  await addDoc(noriMessagesPath(uid, threadId), {
    threadId,
    role: "tool",
    content: result,
    toolCallId: call.id,
    createdAt: serverTimestamp(),
  } as unknown as NoriMessage);
}
