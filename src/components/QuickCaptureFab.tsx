"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  addDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  CheckSquare,
  Droplet,
  Plus,
  Scale,
  Smile,
  Wallet,
  X,
} from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import {
  dailyPath,
  expensesPath,
  todosPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  ExpenseDoc,
  Profile,
  TodoDoc,
} from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import { lbToKg } from "@/lib/workout/units";
import { listExpenseCategories } from "@/lib/money/categories";

/**
 * Quick-capture floating action button. Available app-wide; opens a small
 * sheet that lets the user log one of: weight, mood, water, expense, todo
 * without leaving the current page.
 *
 * Positioning:
 *   - Mobile: bottom-right, just above the bottom tab bar (`bottom-20`)
 *   - Desktop (md+): bottom-right of the viewport, larger inset
 */
type CaptureKind = "weight" | "mood" | "water" | "expense" | "todo" | null;

const MOOD_LABELS: Record<number, string> = {
  1: "😞 Bad",
  2: "😕 Meh",
  3: "😐 Okay",
  4: "🙂 Good",
  5: "😄 Great",
};

export default function QuickCaptureFab() {
  const { uid, profile, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const today = computeLocalDate(new Date(), tz);

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CaptureKind>(null);

  const close = useCallback(() => {
    setOpen(false);
    setKind(null);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useBodyScrollLock(open);

  if (!uid) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick capture"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-neutral-900 shadow-2xl shadow-accent/30 ring-2 ring-accent/30 transition hover:scale-105 active:scale-95 md:bottom-6 md:right-6"
      >
        <Plus className="h-6 w-6" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur md:items-center"
          onClick={close}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-border bg-panel p-4 shadow-2xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">
                {kind ? `Log ${kind}` : "Quick capture"}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3">
              {kind === null ? (
                <KindGrid onPick={setKind} />
              ) : kind === "weight" ? (
                <WeightForm
                  uid={uid}
                  today={today}
                  unitImperial={effectiveProfile?.unitSystem !== "metric"}
                  onDone={close}
                />
              ) : kind === "mood" ? (
                <MoodForm uid={uid} today={today} onDone={close} />
              ) : kind === "water" ? (
                <WaterForm uid={uid} today={today} onDone={close} />
              ) : kind === "expense" ? (
                <ExpenseForm
                  uid={uid}
                  today={today}
                  currency={effectiveProfile?.currency ?? "USD"}
                  profile={profile}
                  onDone={close}
                />
              ) : kind === "todo" ? (
                <TodoForm uid={uid} onDone={close} />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function KindGrid({ onPick }: { onPick: (k: CaptureKind) => void }) {
  const items: {
    kind: NonNullable<CaptureKind>;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    color: string;
  }[] = [
    { kind: "weight", label: "Weight", Icon: Scale, color: "text-cyan-300" },
    { kind: "mood", label: "Mood", Icon: Smile, color: "text-amber-300" },
    { kind: "water", label: "Water", Icon: Droplet, color: "text-sky-300" },
    { kind: "expense", label: "Expense", Icon: Wallet, color: "text-red-300" },
    { kind: "todo", label: "Todo", Icon: CheckSquare, color: "text-emerald-300" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ kind, label, Icon, color }) => (
        <button
          key={kind}
          type="button"
          onClick={() => onPick(kind)}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-neutral-900/60 px-3 py-4 text-xs font-medium text-neutral-100 transition hover:bg-neutral-800/60"
        >
          <Icon className={`h-5 w-5 ${color}`} />
          {label}
        </button>
      ))}
    </div>
  );
}

function WeightForm({
  uid,
  today,
  unitImperial,
  onDone,
}: {
  uid: string;
  today: string;
  unitImperial: boolean;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(value);
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    try {
      const kg = unitImperial ? lbToKg(v) : v;
      await setDoc(
        dailyPath(uid, today),
        {
          localDate: today,
          bodyweightKg: Math.round(kg * 1000) / 1000,
          updatedAt: serverTimestamp(),
        } as unknown as DailyDoc,
        { merge: true },
      );
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <NumberField
        label={`Weight (${unitImperial ? "lb" : "kg"})`}
        value={value}
        onChange={setValue}
        step={unitImperial ? 0.5 : 0.1}
        autoFocus
      />
      {err ? <ErrMsg msg={err} /> : null}
      <SubmitBtn label={saving ? "Saving…" : "Save weight"} disabled={saving || !value} />
    </form>
  );
}

function MoodForm({
  uid,
  today,
  onDone,
}: {
  uid: string;
  today: string;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = async (mood: number) => {
    setSaving(true);
    try {
      await setDoc(
        dailyPath(uid, today),
        {
          localDate: today,
          mood,
          updatedAt: serverTimestamp(),
        } as unknown as DailyDoc,
        { merge: true },
      );
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => pick(n)}
            disabled={saving}
            className="flex h-16 flex-col items-center justify-center rounded-lg border border-border bg-neutral-900/60 text-xs font-medium text-neutral-100 transition hover:bg-neutral-800/60 disabled:opacity-50"
          >
            <span className="text-lg">{MOOD_LABELS[n].split(" ")[0]}</span>
            <span className="text-[10px] text-muted">
              {MOOD_LABELS[n].split(" ")[1]}
            </span>
          </button>
        ))}
      </div>
      {err ? <ErrMsg msg={err} /> : null}
    </div>
  );
}

function WaterForm({
  uid,
  today,
  onDone,
}: {
  uid: string;
  today: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(value);
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    try {
      await setDoc(
        dailyPath(uid, today),
        {
          localDate: today,
          waterMl: Math.round(v),
          updatedAt: serverTimestamp(),
        } as unknown as DailyDoc,
        { merge: true },
      );
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <NumberField
        label="Water (ml)"
        value={value}
        onChange={setValue}
        step={100}
        autoFocus
      />
      <div className="flex flex-wrap gap-1.5">
        {[250, 500, 750, 1000].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setValue(String(preset))}
            className="rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] text-muted hover:text-neutral-200"
          >
            +{preset}ml
          </button>
        ))}
      </div>
      {err ? <ErrMsg msg={err} /> : null}
      <SubmitBtn label={saving ? "Saving…" : "Save water"} disabled={saving || !value} />
    </form>
  );
}

function ExpenseForm({
  uid,
  today,
  currency,
  profile,
  onDone,
}: {
  uid: string;
  today: string;
  currency: string;
  profile: Profile | null;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const categoryOptions = listExpenseCategories(profile);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = parseFloat(amount);
    if (!Number.isFinite(v) || v <= 0) return;
    setSaving(true);
    try {
      await addDoc(expensesPath(uid), {
        amountMinor: Math.round(v * 100),
        currency,
        kind: "expense",
        category,
        localDate: today,
        date: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as unknown as ExpenseDoc);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <NumberField
        label={`Amount (${currency})`}
        value={amount}
        onChange={setAmount}
        step={1}
        autoFocus
      />
      <div>
        <span className="block text-[10px] uppercase tracking-wide text-muted">
          Category
        </span>
        <div className="mt-1 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {categoryOptions.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategory(c.id)}
              className={
                category === c.id
                  ? "h-9 rounded-md bg-accent/20 text-xs font-medium text-accent"
                  : "h-9 rounded-md border border-border bg-neutral-900 text-xs text-muted hover:text-neutral-200"
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {err ? <ErrMsg msg={err} /> : null}
      <SubmitBtn label={saving ? "Saving…" : "Save expense"} disabled={saving || !amount} />
    </form>
  );
}

function TodoForm({
  uid,
  onDone,
}: {
  uid: string;
  onDone: () => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setSaving(true);
    try {
      await addDoc(todosPath(uid), {
        title: t,
        done: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as unknown as TodoDoc);
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="block text-[10px] uppercase tracking-wide text-muted">
          Task
        </span>
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      {err ? <ErrMsg msg={err} /> : null}
      <SubmitBtn label={saving ? "Adding…" : "Add todo"} disabled={saving || !title.trim()} />
    </form>
  );
}

// --- shared bits -----------------------------------------------------------

function NumberField({
  label,
  value,
  onChange,
  step,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus={autoFocus}
        className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-base text-neutral-100 tabular-nums focus:border-accent focus:outline-none"
      />
    </label>
  );
}

function SubmitBtn({ label, disabled }: { label: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="h-11 w-full rounded-md bg-accent text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}

function ErrMsg({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
      {msg}
    </div>
  );
}
