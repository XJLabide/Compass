import { NextResponse, type NextRequest } from "next/server";

import { openAIFormatTools } from "@/lib/nori/tools";

/**
 * Nori chat proxy.
 *
 * The client POSTs the current message history (OpenAI-format) along with a
 * short context blob describing the user (name, units, currency, timezone,
 * today's date, recent summaries). The server calls OpenRouter with the
 * Claude Haiku 4.5 model + the full Nori tool list and returns the assistant
 * message as-is.
 *
 * Crucially the server does NOT execute tool calls — it only returns them.
 * The client's tool executor decides whether to auto-run (reads) or show a
 * confirm dialog (writes), then sends a follow-up `tool` message back to
 * this endpoint with the result.
 */
export const runtime = "nodejs";

const DEFAULT_MODEL =
  process.env.NORI_MODEL || "anthropic/claude-haiku-4-5";

interface IncomingMessage {
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface ChatRequest {
  messages: IncomingMessage[];
  /** Brief context blob the server folds into the system prompt. */
  context?: {
    displayName?: string;
    unitSystem?: "imperial" | "metric";
    currency?: string;
    timezone?: string;
    today?: string;
    summary?: string;
  };
}

function buildSystemPrompt(ctx: ChatRequest["context"]): string {
  const c = ctx ?? {};
  const lines = [
    "You are Nori, the personal AI assistant for Compass — a single-user dashboard for fitness, todos, money, routines, and daily check-ins.",
    "Be concise, direct, and a little warm. Talk like a thoughtful friend who knows the user's data. Use markdown for lists and emphasis.",
    "",
    "When the user asks for current data (todos, expenses, streaks, etc.), call the matching READ tool. Do not guess. Do not invent dates, amounts, or counts.",
    "When the user asks to log/add/update/complete something, call the matching WRITE tool. Confirmation is handled by the UI — do not ask the user to confirm in chat.",
    "",
    "Numeric formatting:",
    "- Money: use the user's currency symbol/code when known. Amounts are MAJOR units (e.g. 12.50 = $12.50).",
    "- Weight: stored canonically in kg; display in the user's unit (imperial = lb, metric = kg).",
    "- Dates: use the user's local YYYY-MM-DD when calling tools.",
    "",
    "If the user asks something you can answer from existing context without calling a tool, do so. If unsure, ask a brief clarifying question.",
  ];

  lines.push("", "## User context");
  if (c.displayName) lines.push(`- Name: ${c.displayName}`);
  if (c.unitSystem) lines.push(`- Units: ${c.unitSystem}`);
  if (c.currency) lines.push(`- Currency: ${c.currency}`);
  if (c.timezone) lines.push(`- Timezone: ${c.timezone}`);
  if (c.today) lines.push(`- Today (local date): ${c.today}`);
  if (c.summary) {
    lines.push("", "## Recent state", c.summary);
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.NORI_OPENROUTER_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "NORI_OPENROUTER_KEY is not set. Add it to the Vercel project environment variables.",
      },
      { status: 500 },
    );
  }

  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages must be a non-empty array" },
      { status: 400 },
    );
  }

  const system = buildSystemPrompt(body.context);
  const payload = {
    model: DEFAULT_MODEL,
    messages: [
      { role: "system", content: system },
      ...body.messages.map((m) => {
        // Pass through OpenAI-format fields verbatim, but drop any extras
        // that our internal types add (e.g. `confirmed` on tool calls).
        const out: Record<string, unknown> = {
          role: m.role,
          content: m.content,
        };
        if (m.tool_calls) out.tool_calls = m.tool_calls;
        if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
        if (m.name) out.name = m.name;
        return out;
      }),
    ],
    tools: openAIFormatTools(),
    tool_choice: "auto",
    temperature: 0.4,
    // Cap output so OpenRouter doesn't reserve the model's full 64K ceiling
    // against your credit balance. 2048 tokens is plenty for chat answers
    // and keeps each turn predictable cost-wise.
    max_tokens: Number(process.env.NORI_MAX_TOKENS || 2048),
  };

  try {
    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          // Best-effort attribution so usage shows up correctly on the
          // OpenRouter dashboard.
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL || "https://compass.local",
          "X-Title": "Compass · Nori",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `OpenRouter ${res.status}: ${errText}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message: {
          role: "assistant";
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
      }>;
    };

    const message = data.choices?.[0]?.message;
    if (!message) {
      return NextResponse.json(
        { error: "Empty response from OpenRouter" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: message.tool_calls ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Unknown error talking to OpenRouter",
      },
      { status: 502 },
    );
  }
}
