"use client";

import { useEffect, useState } from "react";
import { Check, MonitorCog, Palette } from "lucide-react";
import clsx from "clsx";

export type AccentId = "cyan" | "lime" | "amber" | "rose" | "violet";
export type DensityId = "comfortable" | "compact";
export type MotionId = "full" | "reduced";

export type AppearancePreferences = {
  accent: AccentId;
  density: DensityId;
  motion: MotionId;
};

const STORAGE_KEY = "compass.appearance.v1";

const DEFAULT_PREFS: AppearancePreferences = {
  accent: "cyan",
  density: "comfortable",
  motion: "full",
};

const ACCENTS: ReadonlyArray<{
  id: AccentId;
  label: string;
  rgb: string;
  hex: string;
}> = [
  { id: "cyan", label: "Cyan", rgb: "34 211 238", hex: "#22d3ee" },
  { id: "lime", label: "Lime", rgb: "163 230 53", hex: "#a3e635" },
  { id: "amber", label: "Amber", rgb: "245 158 11", hex: "#f59e0b" },
  { id: "rose", label: "Rose", rgb: "251 113 133", hex: "#fb7185" },
  { id: "violet", label: "Violet", rgb: "192 132 252", hex: "#c084fc" },
];

const DENSITIES: ReadonlyArray<{ id: DensityId; label: string }> = [
  { id: "comfortable", label: "Comfortable" },
  { id: "compact", label: "Compact" },
];

const MOTION: ReadonlyArray<{ id: MotionId; label: string }> = [
  { id: "full", label: "Full" },
  { id: "reduced", label: "Reduced" },
];

function normalizePreferences(value: unknown): AppearancePreferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFS;
  const partial = value as Partial<AppearancePreferences>;
  const accent = ACCENTS.find((item) => item.id === partial.accent)?.id;
  const density = DENSITIES.find((item) => item.id === partial.density)?.id;
  const motion = MOTION.find((item) => item.id === partial.motion)?.id;
  return {
    accent: accent ?? DEFAULT_PREFS.accent,
    density: density ?? DEFAULT_PREFS.density,
    motion: motion ?? DEFAULT_PREFS.motion,
  };
}

function readPreferences(): AppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    return normalizePreferences(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_PREFS;
  }
}

export function applyAppearancePreferences(prefs: AppearancePreferences) {
  if (typeof document === "undefined") return;
  const accent = ACCENTS.find((a) => a.id === prefs.accent) ?? ACCENTS[0];
  document.documentElement.style.setProperty("--app-accent-rgb", accent.rgb);
  document.documentElement.dataset.uiDensity = prefs.density;
  document.documentElement.dataset.uiMotion = prefs.motion;
}

export default function AppearanceRuntime() {
  useEffect(() => {
    applyAppearancePreferences(readPreferences());
  }, []);

  return null;
}

export function AppearanceSection() {
  const [prefs, setPrefs] = useState<AppearancePreferences>(DEFAULT_PREFS);

  useEffect(() => {
    const next = readPreferences();
    setPrefs(next);
    applyAppearancePreferences(next);
  }, []);

  const updatePrefs = (patch: Partial<AppearancePreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    applyAppearancePreferences(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  return (
    <div
      className={clsx(
        "space-y-5",
        prefs.density === "compact" && "space-y-3",
      )}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-100">
            <Palette className="h-4 w-4 text-accent" />
            Accent
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ACCENTS.map((accent) => {
              const active = prefs.accent === accent.id;
              return (
                <button
                  key={accent.id}
                  type="button"
                  aria-label={`${accent.label} accent`}
                  aria-pressed={active}
                  onClick={() => updatePrefs({ accent: accent.id })}
                  className={clsx(
                    "flex h-11 items-center justify-center rounded-md border transition-colors",
                    active
                      ? "border-neutral-100 bg-neutral-900"
                      : "border-border bg-neutral-950 hover:border-neutral-600",
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-sm"
                    style={{ backgroundColor: accent.hex }}
                  >
                    {active ? (
                      <Check className="h-3.5 w-3.5 text-neutral-950" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-border bg-neutral-950 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-neutral-100">
            <MonitorCog className="h-4 w-4 text-accent" />
            Preview
          </div>
          <div className="mt-3 h-1.5 rounded-sm bg-accent" />
          <div className="mt-3 grid grid-cols-3 gap-1">
            <span className="h-6 rounded-sm bg-neutral-800" />
            <span className="h-6 rounded-sm bg-neutral-800" />
            <span className="h-6 rounded-sm bg-neutral-800" />
          </div>
        </div>
      </div>

      <PreferenceRow label="Density">
        <SegmentedControl
          items={DENSITIES}
          value={prefs.density}
          onChange={(density) => updatePrefs({ density })}
        />
      </PreferenceRow>

      <PreferenceRow label="Motion">
        <SegmentedControl
          items={MOTION}
          value={prefs.motion}
          onChange={(motion) => updatePrefs({ motion })}
        />
      </PreferenceRow>
    </div>
  );
}

function PreferenceRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
      <div className="text-sm font-medium text-neutral-200">{label}</div>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-neutral-950">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={clsx(
              "h-10 px-3 text-sm font-medium transition-colors",
              active
                ? "bg-neutral-100 text-neutral-950"
                : "text-muted hover:bg-neutral-900 hover:text-neutral-100",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
