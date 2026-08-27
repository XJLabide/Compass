"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import clsx from "clsx";
import {
  Activity,
  ArrowRight,
  Check,
  CheckSquare,
  Flame,
  Plus,
  Target,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import {
  dailyCollectionPath,
  goalPath,
  goalsPath,
  routinesPath,
  sessionsPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  GoalDoc,
  GoalLifeArea,
  GoalMetric,
  GoalMetricDirection,
  GoalMetricSource,
  GoalMilestone,
  GoalState,
  GoalStatus,
  RoutineDoc,
  SessionDoc,
} from "@/lib/db/types";
import {
  countWorkoutsDone,
  getWeekWindow,
  isWithinWeek,
} from "@/lib/dashboard/weekly";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import Skeleton from "@/components/ui/Skeleton";

type GoalRow = { id: string; data: GoalDoc };
type MetricSnapshot = Partial<Record<GoalMetricSource, number | null>>;

const LIFE_AREAS: {
  id: GoalLifeArea;
  name: string;
  Icon: typeof Activity;
  description: string;
  actionHref: string;
}[] = [
  {
    id: "fitness",
    name: "Fitness",
    Icon: Activity,
    description: "Training, weight, steps, strength, running, and sports.",
    actionHref: "/fitness",
  },
  {
    id: "nutrition",
    name: "Nutrition",
    Icon: Flame,
    description: "Calories, protein, meals, and weekly intake averages.",
    actionHref: "/nutrition",
  },
  {
    id: "habits",
    name: "Habits",
    Icon: CheckSquare,
    description: "Routines, streaks, sleep, and recurring commitments.",
    actionHref: "/todos",
  },
  {
    id: "money",
    name: "Money",
    Icon: Wallet,
    description: "Budgets, recurring fees, spending limits, and savings.",
    actionHref: "/money",
  },
  {
    id: "personal",
    name: "Personal",
    Icon: UserRound,
    description: "Manual goals for work, learning, projects, and admin.",
    actionHref: "/todos",
  },
];

const STATUS_LABELS: Record<GoalStatus, string> = {
  on_track: "On track",
  ahead: "Ahead",
  behind: "Behind",
  off_track: "Off track",
  needs_data: "Needs data",
  blocked: "Blocked",
  done: "Done",
};

const STATE_LABELS: Record<GoalState, string> = {
  active: "Active",
  later: "Later",
  completed: "Completed",
};

const SOURCE_OPTIONS: {
  value: GoalMetricSource;
  label: string;
  unit: string;
  direction: GoalMetricDirection;
}[] = [
  { value: "manual", label: "Manual progress", unit: "", direction: "reach" },
  { value: "bodyweight", label: "Bodyweight", unit: "kg", direction: "reach" },
  {
    value: "workouts_per_week",
    label: "Workouts per week",
    unit: "/ week",
    direction: "at_least",
  },
  {
    value: "calories_avg",
    label: "Average calories",
    unit: "kcal",
    direction: "at_most",
  },
  {
    value: "protein_avg",
    label: "Average protein",
    unit: "g",
    direction: "at_least",
  },
  { value: "steps_avg", label: "Average steps", unit: "steps", direction: "at_least" },
  { value: "sleep_avg", label: "Average sleep", unit: "h", direction: "at_least" },
  {
    value: "routine_completion",
    label: "Routine completion",
    unit: "%",
    direction: "at_least",
  },
  { value: "budget_spend", label: "Budget spend", unit: "", direction: "at_most" },
];

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseNumber(value: string): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function formatTarget(metric: GoalMetric): string {
  const prefix =
    metric.direction === "at_most"
      ? "<= "
      : metric.direction === "at_least"
        ? ">= "
        : "";
  return `${prefix}${metric.target}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function metricFromForm(source: GoalMetricSource, target: number): GoalMetric {
  const option =
    SOURCE_OPTIONS.find((item) => item.value === source) ?? SOURCE_OPTIONS[0]!;
  return {
    id: makeId(),
    label: option.label,
    source: option.value,
    direction: option.direction,
    target,
    unit: option.unit,
  };
}

export default function GoalsPage() {
  const { uid, effectiveProfile } = useUserData();
  const timezone = effectiveProfile?.timezone ?? "UTC";
  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(goalsPath(uid), orderBy("priorityRank", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setGoals(snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
        setError(null);
      },
      (err) => {
        setGoals([]);
        setError(err.message);
      },
    );
    return () => unsub();
  }, [uid]);

  const metricSnapshot = useMetricSnapshot(uid, timezone);

  const grouped = useMemo(() => {
    const map = new Map<GoalLifeArea, GoalRow[]>();
    for (const area of LIFE_AREAS) map.set(area.id, []);
    for (const goal of goals ?? []) {
      map.get(goal.data.area)?.push(goal);
    }
    return map;
  }, [goals]);

  if (!uid) return null;

  return (
    <section className="space-y-5">
      <header className="border-b border-border pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
              Goals
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              Organize priorities by life area. Connect each priority to tracked
              metrics, manual milestones, or both.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((open) => !open)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-accent/90"
          >
            <Plus className="h-4 w-4" />
            New goal
          </button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {formOpen ? (
        <NewGoalWizard
          uid={uid}
          existingCount={goals?.length ?? 0}
          onCreated={() => setFormOpen(false)}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      {goals === null ? (
        <LoadingGoals />
      ) : goals.length === 0 ? (
        <EmptyGoals onCreate={() => setFormOpen(true)} />
      ) : null}

      <section aria-labelledby="life-areas-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2
            id="life-areas-heading"
            className="text-sm font-semibold text-neutral-200"
          >
            Life areas
          </h2>
          <span className="text-xs text-muted">One top priority per area</span>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          {LIFE_AREAS.map((area) => (
            <LifeAreaCard
              key={area.id}
              uid={uid}
              area={area}
              goals={grouped.get(area.id) ?? []}
              metricSnapshot={metricSnapshot}
              onCreate={() => setFormOpen(true)}
            />
          ))}
        </div>
      </section>
    </section>
  );
}

const WIZARD_STEPS = [
  "Area",
  "Priority",
  "Primary",
  "Support",
  "Finish",
] as const;

function NewGoalWizard({
  uid,
  existingCount,
  onCreated,
  onClose,
}: {
  uid: string;
  existingCount: number;
  onCreated: () => void;
  onClose: () => void;
}) {
  useBodyScrollLock(true);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [area, setArea] = useState<GoalLifeArea>("fitness");
  const [deadline, setDeadline] = useState("");
  const [primarySource, setPrimarySource] =
    useState<GoalMetricSource>("manual");
  const [primaryTarget, setPrimaryTarget] = useState("");
  const [supportSource, setSupportSource] =
    useState<GoalMetricSource>("workouts_per_week");
  const [supportTarget, setSupportTarget] = useState("");
  const [milestone, setMilestone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const areaMeta = LIFE_AREAS.find((item) => item.id === area) ?? LIFE_AREAS[0]!;
  const lastStep = WIZARD_STEPS.length - 1;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function canContinue(): boolean {
    if (step === 1) return title.trim().length > 0;
    return true;
  }

  function goNext() {
    setError(null);
    if (!canContinue()) {
      setError("Add a goal title.");
      return;
    }
    setStep((current) => Math.min(lastStep, current + 1));
  }

  async function createGoal() {
    const cleanTitle = title.trim();
    const deadlineValue = deadline.trim();
    const primaryTargetValue = primaryTarget;
    const supportTargetValue = supportTarget;
    const milestoneValue = milestone.trim();
    if (!cleanTitle) {
      setError("Add a goal title.");
      return;
    }

    const primaryTargetNum = parseNumber(primaryTargetValue);
    const supportTargetNum = parseNumber(supportTargetValue);
    const primaryMetric =
      primaryTargetNum !== null
        ? metricFromForm(primarySource, primaryTargetNum)
        : undefined;
    const supportingMetrics =
      supportTargetNum !== null
        ? [metricFromForm(supportSource, supportTargetNum)]
        : [];
    const milestones: GoalMilestone[] = milestoneValue
      ? [{ id: makeId(), title: milestoneValue, done: false }]
      : [];

    setSaving(true);
    setError(null);
    try {
      await addDoc(goalsPath(uid), {
        title: cleanTitle,
        area,
        state: "active",
        status: "needs_data",
        priorityRank: existingCount,
        ...(deadlineValue ? { deadlineLocalDate: deadlineValue } : {}),
        ...(primaryMetric ? { primaryMetric } : {}),
        supportingMetrics,
        milestones,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as GoalDoc);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-goal-title"
      className="fixed inset-0 z-50 bg-neutral-950/80 md:flex md:items-center md:justify-center md:p-6"
    >
      <form
        onSubmit={(event) => event.preventDefault()}
        className="flex h-dvh w-full flex-col bg-panel md:h-auto md:max-h-[min(760px,calc(100dvh-3rem))] md:max-w-2xl md:rounded-lg md:border md:border-border"
      >
        <header className="shrink-0 border-b border-border px-4 pb-3 pt-[max(1rem,calc(env(safe-area-inset-top)+0.75rem))] md:px-5 md:pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                id="new-goal-title"
                className="text-lg font-semibold text-neutral-100"
              >
                New goal
              </h2>
              <p className="mt-1 text-sm text-muted">
                Step {step + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[step]}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close new goal"
              className="rounded-md p-2 text-muted transition-colors hover:bg-neutral-900 hover:text-neutral-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1">
            {WIZARD_STEPS.map((item, index) => (
              <div
                key={item}
                className={clsx(
                  "h-1 rounded-full",
                  index <= step ? "bg-accent" : "bg-neutral-800",
                )}
              />
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-5">
          {step === 0 ? (
            <WizardStep
              title="Choose the life area"
              description="Each area can have its own current priority. Pick where this goal belongs."
            >
              <div className="grid gap-2">
                {LIFE_AREAS.map(({ id, name, Icon, description }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setArea(id)}
                    className={clsx(
                      "flex items-start gap-3 rounded-md border p-3 text-left transition-colors",
                      area === id
                        ? "border-accent/60 bg-accent/10"
                        : "border-border bg-neutral-900/50 hover:bg-neutral-900",
                    )}
                  >
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                    <span>
                      <span className="block text-sm font-semibold text-neutral-100">
                        {name}
                      </span>
                      <span className="mt-0.5 block text-sm leading-5 text-muted">
                        {description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </WizardStep>
          ) : null}

          {step === 1 ? (
            <WizardStep
              title={`Define the ${areaMeta.name.toLowerCase()} priority`}
              description="Name the result or behavior you want to make visible."
            >
              <label
                htmlFor="goal-title"
                className="text-sm font-medium text-neutral-200"
              >
                Priority
              </label>
              <input
                id="goal-title"
                name="title"
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Reach a target, finish a project, build consistency..."
                className="mt-2 h-12 w-full rounded-md border border-border bg-neutral-900 px-3 text-base text-neutral-100 outline-none transition focus:border-neutral-500 md:text-sm"
              />
              <div className="mt-4">
                <label
                  htmlFor="goal-deadline"
                  className="text-sm font-medium text-neutral-200"
                >
                  Deadline
                </label>
                <input
                  id="goal-deadline"
                  name="deadline"
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  className="mt-2 h-12 w-full rounded-md border border-border bg-neutral-900 px-3 text-base text-neutral-100 outline-none transition focus:border-neutral-500 md:text-sm"
                />
              </div>
            </WizardStep>
          ) : null}

          {step === 2 ? (
            <WizardStep
              title="Set the main metric"
              description="This is the outcome that tells you whether the goal is working. Leave the target blank for manual-only goals."
            >
              <MetricInputs
                label="Primary metric"
                source={primarySource}
                target={primaryTarget}
                onSourceChange={setPrimarySource}
                onTargetChange={setPrimaryTarget}
              />
            </WizardStep>
          ) : null}

          {step === 3 ? (
            <WizardStep
              title="Add one supporting metric"
              description="Pick a behavior or signal that supports the goal. You can skip this and add more later."
            >
              <MetricInputs
                label="Supporting metric"
                source={supportSource}
                target={supportTarget}
                onSourceChange={setSupportSource}
                onTargetChange={setSupportTarget}
              />
            </WizardStep>
          ) : null}

          {step === 4 ? (
            <WizardStep
              title="Finish setup"
              description="Add one manual milestone if there is a concrete first move the app cannot infer."
            >
              <label
                htmlFor="goal-milestone"
                className="text-sm font-medium text-neutral-200"
              >
                First manual milestone
              </label>
              <input
                id="goal-milestone"
                name="milestone"
                value={milestone}
                onChange={(event) => setMilestone(event.target.value)}
                placeholder="Optional"
                className="mt-2 h-12 w-full rounded-md border border-border bg-neutral-900 px-3 text-base text-neutral-100 outline-none transition focus:border-neutral-500 md:text-sm"
              />
              <div className="mt-5 rounded-md border border-border bg-neutral-900/60 p-3">
                <div className="text-sm font-semibold text-neutral-200">
                  Review
                </div>
                <dl className="mt-2 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Area</dt>
                    <dd className="text-neutral-100">{areaMeta.name}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Priority</dt>
                    <dd className="text-right text-neutral-100">
                      {title.trim() || "Untitled"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Deadline</dt>
                    <dd className="text-neutral-100">{deadline || "None"}</dd>
                  </div>
                </dl>
              </div>
            </WizardStep>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
        </div>

        <footer className="shrink-0 border-t border-border px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)+0.75rem))] pt-3 md:px-5 md:pb-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || saving}
              className="h-10 rounded-md border border-border px-4 text-sm font-medium text-neutral-100 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            {step < lastStep ? (
              <button
                type="button"
                onClick={goNext}
                className="h-10 rounded-md bg-accent px-5 text-sm font-semibold text-neutral-950 transition hover:bg-accent/90"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                data-testid="create-goal-submit"
                disabled={saving}
                onClick={() => void createGoal()}
                className="h-10 rounded-md bg-accent px-5 text-sm font-semibold text-neutral-950 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create goal"}
              </button>
            )}
          </div>
        </footer>
      </form>
    </div>
  );
}

function WizardStep({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-xl">
      <h3 className="text-xl font-semibold tracking-tight text-neutral-100">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
function MetricInputs({
  label,
  source,
  target,
  onSourceChange,
  onTargetChange,
}: {
  label: string;
  source: GoalMetricSource;
  target: string;
  onSourceChange: (value: GoalMetricSource) => void;
  onTargetChange: (value: string) => void;
}) {
  const unit = SOURCE_OPTIONS.find((option) => option.value === source)?.unit;
  const slug = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium text-neutral-200">
        {label}
      </legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <SelectField
          id={`${slug}-source`}
          label="Source"
          value={source}
          onChange={(value) => onSourceChange(value as GoalMetricSource)}
          options={SOURCE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <div>
          <label
            htmlFor={`${slug}-target`}
            className="text-sm font-medium text-neutral-200"
          >
            Target
          </label>
          <div className="mt-1 flex h-10 items-center rounded-md border border-border bg-neutral-900 focus-within:border-neutral-500">
            <input
              id={`${slug}-target`}
              name={slug === "primary-metric" ? "primaryTarget" : "supportTarget"}
              inputMode="decimal"
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              placeholder="Optional"
              className="min-w-0 flex-1 bg-transparent px-3 text-sm text-neutral-100 outline-none"
            />
            {unit ? (
              <span className="pr-3 text-xs text-muted">{unit}</span>
            ) : null}
          </div>
        </div>
      </div>
    </fieldset>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-neutral-200">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition focus:border-neutral-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LifeAreaCard({
  uid,
  area,
  goals,
  metricSnapshot,
  onCreate,
}: {
  uid: string;
  area: (typeof LIFE_AREAS)[number];
  goals: GoalRow[];
  metricSnapshot: MetricSnapshot;
  onCreate: () => void;
}) {
  const { Icon } = area;
  const activeGoals = goals.filter((goal) => goal.data.state === "active");
  const laterGoals = goals.filter((goal) => goal.data.state === "later");
  const completedGoals = goals.filter(
    (goal) => goal.data.state === "completed",
  );
  const priority = activeGoals[0];

  return (
    <article className="rounded-lg border border-border bg-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-neutral-900 text-accent">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-neutral-100">{area.name}</h3>
            <p className="mt-1 text-sm leading-5 text-muted">
              {area.description}
            </p>
          </div>
        </div>
        <Link
          href={area.actionHref}
          className="rounded-md p-2 text-muted transition-colors hover:bg-neutral-900 hover:text-neutral-100"
          aria-label={`Open ${area.name}`}
        >
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4">
        {priority ? (
          <GoalCard
            uid={uid}
            goal={priority}
            metricSnapshot={metricSnapshot}
            priority
          />
        ) : (
          <button
            type="button"
            onClick={onCreate}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-neutral-900/40 px-3 py-4 text-sm font-medium text-muted transition-colors hover:border-neutral-600 hover:text-neutral-100"
          >
            <Plus className="h-4 w-4" />
            Add {area.name.toLowerCase()} priority
          </button>
        )}
      </div>

      {laterGoals.length > 0 || completedGoals.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          {[...laterGoals, ...completedGoals].map((goal) => (
            <GoalCard
              key={goal.id}
              uid={uid}
              goal={goal}
              metricSnapshot={metricSnapshot}
              compact
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}

function GoalCard({
  uid,
  goal,
  metricSnapshot,
  priority = false,
  compact = false,
}: {
  uid: string;
  goal: GoalRow;
  metricSnapshot: MetricSnapshot;
  priority?: boolean;
  compact?: boolean;
}) {
  const { id, data } = goal;
  const [saving, setSaving] = useState(false);

  async function patchGoal(patch: Partial<GoalDoc>) {
    setSaving(true);
    try {
      await updateDoc(goalPath(uid, id), {
        ...patch,
        updatedAt: serverTimestamp(),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleMilestone(milestoneId: string) {
    const milestones = data.milestones.map((milestone) =>
      milestone.id === milestoneId
        ? { ...milestone, done: !milestone.done }
        : milestone,
    );
    await patchGoal({ milestones } as Partial<GoalDoc>);
  }

  return (
    <div
      className={clsx(
        "rounded-md border bg-neutral-900/60",
        priority ? "border-accent/40" : "border-border",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-neutral-100">{data.title}</h4>
            <StatusChip status={data.status} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{STATE_LABELS[data.state]}</span>
            {data.deadlineLocalDate ? (
              <span>Due {data.deadlineLocalDate}</span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void deleteDoc(goalPath(uid, id))}
          aria-label={`Delete ${data.title}`}
          className="rounded-md p-1.5 text-muted transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {!compact ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {data.primaryMetric ? (
              <MetricPill
                label="Primary"
                metric={data.primaryMetric}
                current={metricSnapshot[data.primaryMetric.source]}
              />
            ) : null}
            {data.supportingMetrics.map((metric) => (
              <MetricPill
                key={metric.id}
                label="Supporting"
                metric={metric}
                current={metricSnapshot[metric.source]}
              />
            ))}
          </div>

          {data.milestones.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {data.milestones.map((milestone) => (
                <button
                  key={milestone.id}
                  type="button"
                  onClick={() => void toggleMilestone(milestone.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-neutral-200 transition-colors hover:bg-neutral-800/70"
                >
                  <span
                    className={clsx(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      milestone.done
                        ? "border-accent bg-accent text-neutral-950"
                        : "border-border text-transparent",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  <span
                    className={clsx(milestone.done && "text-muted line-through")}
                  >
                    {milestone.title}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <InlineSelect
              label="Status"
              value={data.status}
              disabled={saving}
              options={Object.entries(STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(value) =>
                void patchGoal({ status: value as GoalStatus })
              }
            />
            <InlineSelect
              label="State"
              value={data.state}
              disabled={saving}
              options={Object.entries(STATE_LABELS).map(([value, label]) => ({
                value,
                label,
              }))}
              onChange={(value) => void patchGoal({ state: value as GoalState })}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetricPill({
  label,
  metric,
  current,
}: {
  label: string;
  metric: GoalMetric;
  current: number | null | undefined;
}) {
  const hasCurrent = current !== undefined && current !== null;
  return (
    <div className="rounded-md border border-border bg-neutral-950/40 px-3 py-2">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-neutral-100">
        {metric.label}
      </div>
      <div className="mt-0.5 text-xs text-muted">
        Target {formatTarget(metric)}
      </div>
      {metric.source !== "manual" ? (
        <div
          className={clsx(
            "mt-1 text-xs font-medium",
            hasCurrent && metricOnTrack(metric, current)
              ? "text-emerald-300"
              : hasCurrent
                ? "text-amber-300"
                : "text-muted",
          )}
        >
          Current{" "}
          {hasCurrent ? formatCurrentValue(metric, current) : "needs data"}
        </div>
      ) : null}
    </div>
  );
}

function metricOnTrack(metric: GoalMetric, current: number): boolean {
  if (metric.direction === "at_most") return current <= metric.target;
  if (metric.direction === "at_least") return current >= metric.target;
  return Math.abs(current - metric.target) < 0.0001;
}

function formatCurrentValue(metric: GoalMetric, current: number): string {
  const rounded =
    Math.abs(current) >= 100 ? Math.round(current) : Math.round(current * 10) / 10;
  return `${rounded}${metric.unit ? ` ${metric.unit}` : ""}`;
}

function avgDailyMetric(
  daily: readonly DailyDoc[],
  field: "bodyweightKg" | "calories" | "proteinG" | "steps" | "sleepHours",
  start: string,
  end: string,
): number | null {
  let sum = 0;
  let n = 0;
  for (const doc of daily) {
    if (!isWithinWeek(doc.localDate, start, end)) continue;
    const value = doc[field];
    if (typeof value === "number" && Number.isFinite(value)) {
      sum += value;
      n += 1;
    }
  }
  return n === 0 ? null : sum / n;
}

function routineCompletion(
  routines: readonly RoutineDoc[],
  start: string,
  end: string,
): number | null {
  let scheduled = 0;
  let done = 0;
  const startDate = Date.parse(`${start}T00:00:00Z`);
  const endDate = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate) || Number.isNaN(endDate)) return null;

  for (let time = startDate; time <= endDate; time += 24 * 60 * 60 * 1000) {
    const date = new Date(time);
    const localDate = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    for (const routine of routines) {
      if (!routine.active) continue;
      if (!routine.weekdays.includes(dow)) continue;
      scheduled += 1;
      if (routine.done?.[localDate]) done += 1;
    }
  }

  return scheduled === 0 ? null : (done / scheduled) * 100;
}

function useMetricSnapshot(uid: string | null, timezone: string): MetricSnapshot {
  const [daily, setDaily] = useState<DailyDoc[] | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);
  const [routines, setRoutines] = useState<RoutineDoc[] | null>(null);

  const window = useMemo(
    () => getWeekWindow(new Date(), timezone || "UTC"),
    [timezone],
  );

  useEffect(() => {
    if (!uid) return;
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", ">=", window.startLocalDate),
      where("localDate", "<=", window.endLocalDate),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(q, (snap) =>
      setDaily(snap.docs.map((doc) => doc.data())),
    );
    return () => unsub();
  }, [uid, window.startLocalDate, window.endLocalDate]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      sessionsPath(uid),
      where("localDate", ">=", window.startLocalDate),
      where("localDate", "<=", window.endLocalDate),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(q, (snap) =>
      setSessions(snap.docs.map((doc) => doc.data())),
    );
    return () => unsub();
  }, [uid, window.startLocalDate, window.endLocalDate]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(routinesPath(uid), (snap) =>
      setRoutines(snap.docs.map((doc) => doc.data())),
    );
    return () => unsub();
  }, [uid]);

  return useMemo(() => {
    const snapshot: MetricSnapshot = {};
    if (daily) {
      snapshot.bodyweight = avgDailyMetric(
        daily,
        "bodyweightKg",
        window.startLocalDate,
        window.endLocalDate,
      );
      snapshot.calories_avg = avgDailyMetric(
        daily,
        "calories",
        window.startLocalDate,
        window.endLocalDate,
      );
      snapshot.protein_avg = avgDailyMetric(
        daily,
        "proteinG",
        window.startLocalDate,
        window.endLocalDate,
      );
      snapshot.steps_avg = avgDailyMetric(
        daily,
        "steps",
        window.startLocalDate,
        window.endLocalDate,
      );
      snapshot.sleep_avg = avgDailyMetric(
        daily,
        "sleepHours",
        window.startLocalDate,
        window.endLocalDate,
      );
    }
    if (sessions) {
      snapshot.workouts_per_week = countWorkoutsDone(
        sessions,
        window.startLocalDate,
        window.endLocalDate,
      );
    }
    if (routines) {
      snapshot.routine_completion = routineCompletion(
        routines,
        window.startLocalDate,
        window.endLocalDate,
      );
    }
    return snapshot;
  }, [daily, sessions, routines, window.startLocalDate, window.endLocalDate]);
}

function StatusChip({ status }: { status: GoalStatus }) {
  return (
    <span
      className={clsx(
        "rounded-md border px-2 py-0.5 text-xs font-medium",
        status === "on_track" || status === "ahead" || status === "done"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : status === "behind" || status === "needs_data"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : "border-red-500/30 bg-red-500/10 text-red-300",
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function InlineSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-xs font-medium text-muted">
      {label}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-9 w-full rounded-md border border-border bg-neutral-950 px-2 text-sm text-neutral-100 outline-none transition focus:border-neutral-500 disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyGoals({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="flex items-center gap-2 text-neutral-100">
            <Target className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-semibold">Create your first priority</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Goals starts empty so you can build the system yourself. Pick one
            life area and define the outcome or behavior you want to drive.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-neutral-950 transition-colors hover:bg-accent/90"
        >
          <Plus className="h-4 w-4" />
          New goal
        </button>
      </div>
    </section>
  );
}

function LoadingGoals() {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <Skeleton className="h-48 rounded-lg" />
      <Skeleton className="h-48 rounded-lg" />
    </section>
  );
}
