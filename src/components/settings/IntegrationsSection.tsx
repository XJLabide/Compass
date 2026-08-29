"use client";

import type { ReactNode } from "react";
import { CalendarDays, GraduationCap, Trophy, type LucideIcon } from "lucide-react";

import GoogleCalendarIntegrationSection from "@/components/settings/GoogleCalendarIntegrationSection";

type IntegrationShell = {
  id: string;
  name: string;
  description: string;
  state: "available" | "planned";
  icon: LucideIcon;
  panel?: ReactNode;
};

const integrations: IntegrationShell[] = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Import selected calendars into Compass manually.",
    state: "available",
    icon: CalendarDays,
    panel: <GoogleCalendarIntegrationSection />,
  },
  {
    id: "strava",
    name: "Strava",
    description: "Running and ride activity sync.",
    state: "planned",
    icon: Trophy,
  },
  {
    id: "canvas-lms",
    name: "Canvas LMS",
    description: "Assignments and course dates.",
    state: "planned",
    icon: GraduationCap,
  },
];

export default function IntegrationsSection() {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-neutral-950">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-neutral-100">
          Connected services
        </h3>
        <p className="mt-1 text-xs text-muted">
          Manage external accounts and manual imports from one place.
        </p>
      </div>

      <div className="divide-y divide-border">
        {integrations.map((integration) => (
          <IntegrationRow key={integration.id} integration={integration} />
        ))}
      </div>
    </div>
  );
}

function IntegrationRow({
  integration,
}: {
  integration: IntegrationShell;
}) {
  const Icon = integration.icon;
  return (
    <section className="grid gap-4 px-4 py-4 md:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="flex min-w-0 gap-3">
        <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-sm font-semibold text-neutral-100">
              {integration.name}
            </h4>
            {integration.state === "planned" ? (
              <span className="text-xs text-muted">Soon</span>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted">
            {integration.description}
          </p>
        </div>
      </div>

      {integration.panel ? (
        <div>{integration.panel}</div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-neutral-900/40 px-3 py-2">
          <span className="text-xs text-muted">Not configured yet</span>
          <button
            type="button"
            disabled
            className="h-9 rounded-md border border-border px-3 text-xs font-medium text-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Connect
          </button>
        </div>
      )}
    </section>
  );
}
