"use client";

import { useMemo } from "react";

import type { Timezone } from "@/lib/db/types";

type Props = {
  id?: string;
  value: Timezone;
  onChange: (next: Timezone) => void;
  disabled?: boolean;
};

/**
 * Common IANA timezones. Not exhaustive — Intl.supportedValuesOf("timeZone")
 * yields ~400 zones which is unwieldy for a small mobile select. We list the
 * heavy hitters and always include the user's auto-detected zone (if missing).
 */
const COMMON_ZONES: ReadonlyArray<Timezone> = [
  "UTC",
  // Americas
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Halifax",
  "America/Mexico_City",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  // Europe / Africa
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Helsinki",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  // Asia / Pacific
  "Asia/Jerusalem",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

/** Auto-detected IANA timezone, or `"UTC"` if detection fails. */
export function detectTimezone(): Timezone {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || "UTC";
  } catch {
    return "UTC";
  }
}

export default function TimezoneSelect({
  id,
  value,
  onChange,
  disabled,
}: Props) {
  const options = useMemo(() => {
    const set = new Set<Timezone>(COMMON_ZONES);
    if (value) set.add(value);
    const detected = detectTimezone();
    set.add(detected);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [value]);

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-2 text-sm text-neutral-100 outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {options.map((tz) => (
        <option key={tz} value={tz}>
          {tz}
        </option>
      ))}
    </select>
  );
}
