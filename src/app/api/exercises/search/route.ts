import { NextResponse, type NextRequest } from "next/server";

/**
 * ExerciseDB search proxy.
 *
 * The picker hits this endpoint with `?q=<term>` when the user types in the
 * "Search the library" field. We forward to the public ExerciseDB instance
 * (`oss.exercisedb.dev`) and trim the payload down to what the client UI
 * needs.
 *
 * Why server-side and not direct client fetch:
 *   - we get to set a friendly `User-Agent` so the upstream knows who we are
 *   - Next.js' `fetch` cache deduplicates and reuses responses across users
 *     for the same `?name=` query (cached for a week — see `revalidate`)
 *   - if upstream changes shape or moves we only touch one file
 *   - hides any future API key behind the server boundary
 */

export const runtime = "nodejs";

const BASE = "https://oss.exercisedb.dev/api/v1/exercises";
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const MIN_QUERY_LEN = 2;
const MAX_RESULTS = 25;

interface UpstreamExercise {
  exerciseId?: unknown;
  name?: unknown;
  gifUrl?: unknown;
  bodyParts?: unknown;
  targetMuscles?: unknown;
  secondaryMuscles?: unknown;
  equipments?: unknown;
  instructions?: unknown;
}

interface TrimmedResult {
  apiId: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  instructions: string[];
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function trim(entry: UpstreamExercise): TrimmedResult | null {
  if (typeof entry.name !== "string" || entry.name.length === 0) return null;
  return {
    apiId: typeof entry.exerciseId === "string" ? entry.exerciseId : "",
    name: entry.name,
    gifUrl: typeof entry.gifUrl === "string" ? entry.gifUrl : "",
    bodyParts: asStringArray(entry.bodyParts),
    targetMuscles: asStringArray(entry.targetMuscles),
    secondaryMuscles: asStringArray(entry.secondaryMuscles),
    equipments: asStringArray(entry.equipments),
    instructions: asStringArray(entry.instructions),
  };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < MIN_QUERY_LEN) {
    return NextResponse.json({ results: [] satisfies TrimmedResult[] });
  }

  const url = `${BASE}?name=${encodeURIComponent(q)}&limit=${MAX_RESULTS}`;
  try {
    const upstream = await fetch(url, {
      next: { revalidate: WEEK_SECONDS, tags: ["exercisedb-search"] },
      headers: {
        Accept: "application/json",
        "User-Agent": "PersonalTracker/1.0 (+exercisedb-search)",
      },
    });
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return NextResponse.json(
        { results: [], error: `Upstream ${upstream.status}` },
        { status },
      );
    }
    const json: unknown = await upstream.json();
    const dataRaw =
      json && typeof json === "object" && "data" in json
        ? (json as { data: unknown }).data
        : null;
    const data = Array.isArray(dataRaw) ? (dataRaw as UpstreamExercise[]) : [];

    const results: TrimmedResult[] = [];
    for (const entry of data) {
      const trimmed = trim(entry);
      if (trimmed) results.push(trimmed);
    }
    return NextResponse.json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { results: [], error: msg },
      { status: 502 },
    );
  }
}
