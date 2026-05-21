#!/usr/bin/env node
/**
 * import-exercisedb.mjs
 *
 * Phase 1 of the ExerciseDB rollout.
 *
 * Pulls all exercises from https://oss.exercisedb.dev/api/v1/exercises,
 * filters to lifting-relevant entries, maps target muscles to our
 * MuscleGroup union, and regenerates src/lib/data/exerciseMaster.ts with
 * rich data (gifUrl, instructions, secondaryMuscles, equipments, apiId).
 *
 * CRITICAL: The 29 currently-seeded exercise IDs are preserved verbatim.
 * upperLowerProgram.ts and programTemplates.ts validate every exerciseId
 * at module load and throw if missing — we must keep them all.
 */

import { writeFile, readFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const OUT_PATH = resolve(REPO_ROOT, "src/lib/data/exerciseMaster.ts");
const CACHE_DIR = resolve(REPO_ROOT, ".cache");
const CACHE_PATH = resolve(CACHE_DIR, "exercisedb.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const API_BASE = "https://oss.exercisedb.dev/api/v1/exercises";
const PAGE_LIMIT = 200;

// ---------------------------------------------------------------------------
// Preservation list — must survive regeneration verbatim.
// Mirrors the current EXERCISE_MASTER (29 entries).
// ---------------------------------------------------------------------------

const PRESERVED = [
  // Chest
  { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "chest-fly", name: "Chest Fly", primaryMuscle: "chest", category: "isolation" },

  // Back
  { id: "barbell-row", name: "Barbell Row", primaryMuscle: "back", category: "compound" },
  { id: "pull-up", name: "Pull-Up", primaryMuscle: "back", category: "compound" },
  { id: "lat-pulldown", name: "Lat Pulldown", primaryMuscle: "back", category: "compound" },
  { id: "seated-cable-row", name: "Seated Cable Row", primaryMuscle: "back", category: "compound" },
  { id: "face-pull", name: "Face Pull", primaryMuscle: "back", category: "accessory" },

  // Shoulders
  { id: "overhead-press", name: "Overhead Press", primaryMuscle: "shoulders", category: "compound" },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", primaryMuscle: "shoulders", category: "compound" },
  { id: "lateral-raise", name: "Lateral Raise", primaryMuscle: "shoulders", category: "isolation" },

  // Arms
  { id: "barbell-curl", name: "Barbell Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "dumbbell-curl", name: "Dumbbell Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "hammer-curl", name: "Hammer Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "tricep-pushdown", name: "Tricep Pushdown", primaryMuscle: "triceps", category: "isolation" },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", primaryMuscle: "triceps", category: "isolation" },

  // Quads
  { id: "back-squat", name: "Back Squat", primaryMuscle: "quads", category: "compound" },
  { id: "front-squat", name: "Front Squat", primaryMuscle: "quads", category: "compound" },
  { id: "leg-press", name: "Leg Press", primaryMuscle: "quads", category: "compound" },
  { id: "leg-extension", name: "Leg Extension", primaryMuscle: "quads", category: "isolation" },
  { id: "walking-lunge", name: "Walking Lunge", primaryMuscle: "quads", category: "compound" },

  // Hamstrings / posterior
  { id: "deadlift", name: "Deadlift", primaryMuscle: "hamstrings", category: "compound" },
  { id: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscle: "hamstrings", category: "compound" },
  { id: "lying-leg-curl", name: "Lying Leg Curl", primaryMuscle: "hamstrings", category: "isolation" },

  // Glutes
  { id: "hip-thrust", name: "Hip Thrust", primaryMuscle: "glutes", category: "compound" },

  // Calves
  { id: "standing-calf-raise", name: "Standing Calf Raise", primaryMuscle: "calves", category: "isolation" },

  // Core
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", primaryMuscle: "core", category: "isolation" },
  { id: "plank", name: "Plank", primaryMuscle: "core", category: "isolation" },
];

// ---------------------------------------------------------------------------
// Filters & mappings
// ---------------------------------------------------------------------------

const ALLOWED_EQUIPMENT = new Set([
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "leverage machine",
  "body weight",
  "kettlebell",
  "smith machine",
  "ez-barbell",
  "weighted",
]);

const ALLOWED_BODY_PARTS = new Set([
  "chest",
  "back",
  "shoulders",
  "upper arms",
  "lower arms",
  "upper legs",
  "lower legs",
  "waist",
]);

const NAME_EXCLUDE_TERMS = [
  "alternating",
  "wide grip",
  "narrow grip",
  "single arm",
  "single leg",
  "behind back",
  "reverse grip",
];

/**
 * Maps ExerciseDB's `targetMuscles[0]` to our `MuscleGroup` union.
 *
 * Includes both the textbook names from the spec AND the actual values
 * ExerciseDB returns (pectorals, delts, lats, etc.).
 */
const MUSCLE_MAP = {
  // chest
  pectorals: "chest",
  "pectoralis major": "chest",
  "pectoralis minor": "chest",
  "serratus anterior": "chest",
  // back
  lats: "back",
  "latissimus dorsi": "back",
  "upper back": "back",
  traps: "back",
  trapezius: "back",
  rhomboids: "back",
  spine: "back",
  "erector spinae": "back",
  infraspinatus: "back",
  "teres major": "back",
  "teres minor": "back",
  "lower back": "back",
  "levator scapulae": "back",
  // shoulders
  delts: "shoulders",
  deltoid: "shoulders",
  "anterior deltoid": "shoulders",
  "lateral deltoid": "shoulders",
  "posterior deltoid": "shoulders",
  shoulders: "shoulders",
  // biceps
  biceps: "biceps",
  "biceps brachii": "biceps",
  brachialis: "biceps",
  brachioradialis: "biceps",
  // triceps
  triceps: "triceps",
  "triceps brachii": "triceps",
  // quads
  quads: "quads",
  quadriceps: "quads",
  "vastus lateralis": "quads",
  "vastus medialis": "quads",
  "rectus femoris": "quads",
  "hip flexors": "quads",
  // hamstrings
  hamstrings: "hamstrings",
  "biceps femoris": "hamstrings",
  // glutes
  glutes: "glutes",
  "gluteus maximus": "glutes",
  "gluteus medius": "glutes",
  abductors: "glutes",
  // calves
  calves: "calves",
  gastrocnemius: "calves",
  soleus: "calves",
  // core
  abs: "core",
  "rectus abdominis": "core",
  obliques: "core",
  "transverse abdominis": "core",
  // forearms (skip — not in MUSCLE_GROUPS_IN_ORDER so they get dropped)
};

const MUSCLE_GROUPS_IN_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
];

const PER_MUSCLE_CAP = 13;

// ---------------------------------------------------------------------------
// Network with retry
// ---------------------------------------------------------------------------

const REQUEST_DELAY_MS = 350; // throttle between requests to avoid 429

async function fetchWithRetry(url, attempts = 6) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "compass-import/1.0" },
      });
      if (res.status === 429) {
        const retryAfterHdr = res.headers.get("retry-after");
        const retryAfter = retryAfterHdr ? Number(retryAfterHdr) * 1000 : null;
        const backoff = retryAfter && Number.isFinite(retryAfter)
          ? retryAfter
          : Math.min(30_000, 1000 * 2 ** i);
        console.error(`  ! 429 rate-limited on attempt ${i + 1}/${attempts}. waiting ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      const backoff = Math.min(15_000, 1000 * 2 ** i);
      console.error(`  ! attempt ${i + 1}/${attempts} failed: ${err.message}. retrying in ${backoff}ms`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr ?? new Error(`Exhausted retries for ${url}`);
}

async function fetchAllExercises() {
  const all = [];
  let cursor = null;
  let page = 0;
  while (true) {
    page += 1;
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) params.set("after", cursor);
    const url = `${API_BASE}?${params.toString()}`;
    process.stderr.write(`  fetching page ${page} (cursor=${cursor ?? "start"})... `);
    const json = await fetchWithRetry(url);
    const data = Array.isArray(json?.data) ? json.data : [];
    all.push(...data);
    const next = json?.meta?.nextCursor;
    const hasNext = Boolean(json?.meta?.hasNextPage) && next;
    process.stderr.write(`got ${data.length} (total so far: ${all.length})\n`);
    if (!hasNext) break;
    cursor = next;
    // Friendly throttle between requests to keep the API happy.
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
  }
  return all;
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function arraysOverlap(arr, set) {
  if (!Array.isArray(arr)) return false;
  for (const item of arr) {
    if (typeof item === "string" && set.has(item.toLowerCase())) return true;
  }
  return false;
}

function nameHasExcludedTerm(name) {
  const lower = name.toLowerCase();
  return NAME_EXCLUDE_TERMS.some((term) => lower.includes(term));
}

function mapMuscle(targetMuscles) {
  if (!Array.isArray(targetMuscles) || targetMuscles.length === 0) return null;
  const primary = String(targetMuscles[0] ?? "").toLowerCase().trim();
  return MUSCLE_MAP[primary] ?? null;
}

function inferCategory(name, equipments) {
  const lower = name.toLowerCase();
  const equipSet = new Set((equipments ?? []).map((e) => String(e).toLowerCase()));

  const compoundNameTerms = [
    "squat",
    "press",
    "row",
    "deadlift",
    "pull-up",
    "pull up",
    "dip",
    "clean",
    "snatch",
    "lunge",
  ];
  const isolationNameTerms = [
    "curl",
    "fly",
    "raise",
    "extension",
    "kickback",
    "crunch",
    "pulldown",
  ];

  const hasCompoundName = compoundNameTerms.some((t) => lower.includes(t));
  const hasIsolationName = isolationNameTerms.some((t) => lower.includes(t));
  const isCompoundEquip = equipSet.has("barbell") || equipSet.has("body weight");

  if (isCompoundEquip && hasCompoundName) return "compound";
  if (hasIsolationName) return "isolation";
  return "accessory";
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function isLiftingRelevant(ex) {
  if (!ex || typeof ex !== "object") return false;
  if (typeof ex.name !== "string" || ex.name.length === 0) return false;
  if (!arraysOverlap(ex.equipments, ALLOWED_EQUIPMENT)) return false;
  if (!arraysOverlap(ex.bodyParts, ALLOWED_BODY_PARTS)) return false;
  if (nameHasExcludedTerm(ex.name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Preservation match — find best ExerciseDB entry for a preserved id
// ---------------------------------------------------------------------------

// Per-id override hints. Keys are preserved ids, values are name fragments
// that must appear (in lowercase) in the API entry's name. Helps disambiguate
// generic "bench press" → barbell bench press, etc.
const PRESERVATION_HINTS = {
  "bench-press": { include: ["barbell bench press"], excludeIf: ["incline", "decline", "close grip", "wide grip", "smith", "reverse"] },
  "incline-bench-press": { include: ["barbell incline bench press"], excludeIf: ["decline", "smith", "reverse", "seated", "palms"] },
  "dumbbell-bench-press": { include: ["dumbbell bench press"], excludeIf: ["incline", "decline", "palms"] },
  "chest-fly": { include: ["dumbbell fly", "cable fly", "chest fly", "pec deck"], excludeIf: ["incline", "decline", "twisted"] },
  "barbell-row": { include: ["barbell bent over row", "bent over barbell row"], excludeIf: ["smith", "yates", "underhand", "reverse grip"] },
  "pull-up": { include: ["pull-up", "pull up"], excludeIf: ["assisted", "weighted", "negative", "chin", "incline"] },
  "lat-pulldown": { include: ["lat pulldown", "cable lat pulldown"], excludeIf: ["underhand", "behind"] },
  "seated-cable-row": { include: ["seated cable row", "cable seated row"], excludeIf: ["one arm"] },
  // ExerciseDB has no "face pull" entry. Closest equivalents (rear delt cable rows) are
  // not semantically the same — leave bare and let the seeded entry remain a stub.
  "face-pull": { include: [], excludeIf: [] },
  // ExerciseDB only has "wide", "close grip", and "seated behind head" military press
  // variants. Match the standing barbell variant by partial fragments — wide standing
  // is the only barbell standing OHP that presses overhead from the front. Aliased
  // so the rich data still attaches.
  "overhead-press": { include: ["barbell standing", "military press"], excludeIf: ["seated", "behind", "close grip", "smith", "push press"] },
  // ExerciseDB has "dumbbell standing overhead press" → matches a standing DB shoulder press.
  "dumbbell-shoulder-press": { include: ["dumbbell standing overhead press"], excludeIf: ["alternate", "horizontal"] },
  "lateral-raise": { include: ["dumbbell lateral raise", "dumbbell side lateral raise"], excludeIf: ["front", "rear", "bent", "cable", "seated"] },
  "barbell-curl": { include: ["barbell curl", "standing barbell curl"], excludeIf: ["preacher", "ez", "drag", "reverse", "wide", "close"] },
  "dumbbell-curl": { include: ["dumbbell curl", "standing dumbbell curl", "dumbbell biceps curl"], excludeIf: ["hammer", "incline", "preacher", "concentration", "seated", "twist"] },
  "hammer-curl": { include: ["hammer curl", "dumbbell hammer curl"], excludeIf: ["cable", "incline", "seated"] },
  "tricep-pushdown": { include: ["triceps pushdown", "cable pushdown", "tricep pushdown"], excludeIf: ["overhead", "rope"] },
  "overhead-tricep-extension": { include: ["overhead triceps extension", "dumbbell overhead triceps extension", "cable overhead triceps extension"], excludeIf: ["lying", "seated"] },
  "back-squat": { include: ["barbell squat", "barbell back squat", "barbell full squat"], excludeIf: ["front", "split", "box", "zercher", "sumo", "smith", "jefferson", "hack"] },
  "front-squat": { include: ["barbell front squat"], excludeIf: ["split", "smith"] },
  "leg-press": { include: ["leg press", "sled leg press"], excludeIf: ["calf", "vertical", "single"] },
  "leg-extension": { include: ["leg extension", "lever leg extension"], excludeIf: ["lying", "single"] },
  "walking-lunge": { include: ["walking lunge", "dumbbell walking lunge"], excludeIf: ["overhead"] },
  "deadlift": { include: ["barbell deadlift"], excludeIf: ["romanian", "stiff", "sumo", "deficit", "rack", "snatch", "trap bar", "single", "behind"] },
  "romanian-deadlift": { include: ["romanian deadlift", "barbell romanian deadlift"], excludeIf: ["dumbbell", "single"] },
  "lying-leg-curl": { include: ["lying leg curl", "lever lying leg curl"], excludeIf: ["single"] },
  // ExerciseDB has no "barbell hip thrust" — closest analogue is "barbell glute bridge".
  "hip-thrust": { include: ["barbell glute bridge"], excludeIf: ["two legs on bench", "march"] },
  "standing-calf-raise": { include: ["standing calf raise", "barbell standing calf raise", "lever standing calf raise"], excludeIf: ["seated", "donkey", "single"] },
  "hanging-leg-raise": { include: ["hanging leg raise", "hanging knee raise"], excludeIf: ["assisted"] },
  plank: { include: ["front plank"], excludeIf: ["side", "reverse", "knee tucks", "elbow plank up", "hip", "spider"] },
};

function findBestApiMatch(preservedId, apiEntries) {
  const hint = PRESERVATION_HINTS[preservedId];
  if (!hint) return null;

  // Score: number of include phrases that appear in name; prefer shorter names on tie.
  let best = null;
  let bestScore = -1;
  let bestLen = Infinity;

  for (const ex of apiEntries) {
    const name = String(ex.name ?? "").toLowerCase();
    if (!name) continue;

    // Exclude if any excludeIf fragment appears.
    if (hint.excludeIf?.some((t) => name.includes(t))) continue;

    // Score = count of include fragments matched.
    let score = 0;
    for (const inc of hint.include) {
      if (name.includes(inc)) score += 1;
    }
    if (score === 0) continue;

    if (score > bestScore || (score === bestScore && name.length < bestLen)) {
      best = ex;
      bestScore = score;
      bestLen = name.length;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Emit a SeedExercise object (preserving our id/name/primaryMuscle/category)
// ---------------------------------------------------------------------------

function buildEnrichedFromApi(preserved, apiEntry) {
  const out = {
    id: preserved.id,
    name: preserved.name,
    primaryMuscle: preserved.primaryMuscle,
    category: preserved.category,
  };
  if (apiEntry) {
    if (typeof apiEntry.gifUrl === "string") out.gifUrl = apiEntry.gifUrl;
    if (Array.isArray(apiEntry.instructions) && apiEntry.instructions.length > 0) {
      out.instructions = apiEntry.instructions.map((s) => String(s).replace(/^Step\s*:\s*\d+\s*/i, "").trim());
    }
    if (Array.isArray(apiEntry.secondaryMuscles) && apiEntry.secondaryMuscles.length > 0) {
      out.secondaryMuscles = apiEntry.secondaryMuscles.map(String);
    }
    if (Array.isArray(apiEntry.equipments) && apiEntry.equipments.length > 0) {
      out.equipments = apiEntry.equipments.map(String);
    }
    if (typeof apiEntry.exerciseId === "string") out.apiId = apiEntry.exerciseId;
    if (typeof apiEntry.name === "string" && apiEntry.name.toLowerCase() !== preserved.name.toLowerCase()) {
      out.aliases = [apiEntry.name];
    }
  }
  return out;
}

function buildFromApi(apiEntry, primaryMuscle, category) {
  const out = {
    id: slugify(apiEntry.name),
    name: titleCase(apiEntry.name),
    primaryMuscle,
    category,
  };
  if (typeof apiEntry.gifUrl === "string") out.gifUrl = apiEntry.gifUrl;
  if (Array.isArray(apiEntry.instructions) && apiEntry.instructions.length > 0) {
    out.instructions = apiEntry.instructions.map((s) => String(s).replace(/^Step\s*:\s*\d+\s*/i, "").trim());
  }
  if (Array.isArray(apiEntry.secondaryMuscles) && apiEntry.secondaryMuscles.length > 0) {
    out.secondaryMuscles = apiEntry.secondaryMuscles.map(String);
  }
  if (Array.isArray(apiEntry.equipments) && apiEntry.equipments.length > 0) {
    out.equipments = apiEntry.equipments.map(String);
  }
  if (typeof apiEntry.exerciseId === "string") out.apiId = apiEntry.exerciseId;
  return out;
}

function titleCase(s) {
  return String(s)
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function serializeArray(arr) {
  if (!arr) return "undefined";
  return JSON.stringify(arr);
}

function serializeEntry(e) {
  const lines = [];
  lines.push(`    id: ${JSON.stringify(e.id)},`);
  lines.push(`    name: ${JSON.stringify(e.name)},`);
  lines.push(`    primaryMuscle: ${JSON.stringify(e.primaryMuscle)},`);
  lines.push(`    category: ${JSON.stringify(e.category)},`);
  if (e.gifUrl) lines.push(`    gifUrl: ${JSON.stringify(e.gifUrl)},`);
  if (e.instructions) lines.push(`    instructions: ${serializeArray(e.instructions)},`);
  if (e.secondaryMuscles) lines.push(`    secondaryMuscles: ${serializeArray(e.secondaryMuscles)},`);
  if (e.equipments) lines.push(`    equipments: ${serializeArray(e.equipments)},`);
  if (e.aliases) lines.push(`    aliases: ${serializeArray(e.aliases)},`);
  if (e.apiId) lines.push(`    apiId: ${JSON.stringify(e.apiId)},`);
  return `  {\n${lines.join("\n")}\n  },`;
}

function emitFile(entries) {
  const header = `import type { Exercise, ExerciseCategory, MuscleGroup } from "@/lib/db/types";

/**
 * Master list of seeded exercises for first-run.
 *
 * Each entry carries a stable \`id\` (slug) used as the Firestore document id
 * under \`users/{uid}/exercises/{exerciseId}\` and referenced from the seeded
 * program templates (\`upperLowerProgram.ts\`, \`programTemplates.ts\`). Ids
 * are stable across reseeds so program templates never point at a missing
 * exercise.
 *
 * The shape here is the writeable subset of \`Exercise\` (no \`createdAt\`);
 * the seeder attaches \`serverTimestamp()\` and \`seeded: true\` at write
 * time.
 *
 * Generated by scripts/import-exercisedb.mjs — re-run that script to refresh
 * gifUrl / instructions / secondaryMuscles / equipments from ExerciseDB.
 */

export interface SeedExercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  category: ExerciseCategory;
  gifUrl?: string;
  instructions?: string[];
  secondaryMuscles?: string[];
  equipments?: string[];
  aliases?: string[];
  apiId?: string;
}

export type SeededExerciseDoc = Omit<Exercise, "createdAt">;

export const EXERCISE_MASTER: SeedExercise[] = [
`;
  const body = entries.map(serializeEntry).join("\n");
  return `${header}${body}\n];\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadCachedOrFetch() {
  // Try cache first.
  try {
    const st = await stat(CACHE_PATH);
    if (Date.now() - st.mtimeMs < CACHE_TTL_MS) {
      const raw = await readFile(CACHE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 100) {
        console.error(`      Using cached API response (${parsed.length} entries, ${Math.round((Date.now() - st.mtimeMs) / 1000)}s old).`);
        return parsed;
      }
    }
  } catch {
    // No cache or unreadable — fall through and fetch.
  }
  const data = await fetchAllExercises();
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CACHE_PATH, JSON.stringify(data), "utf8");
    console.error(`      Cached ${data.length} entries to ${CACHE_PATH}`);
  } catch (err) {
    console.error(`      WARN: failed to write cache: ${err.message}`);
  }
  return data;
}

async function main() {
  console.error("[1/4] Fetching ExerciseDB...");
  const apiEntries = await loadCachedOrFetch();
  console.error(`      Got ${apiEntries.length} total entries from API.`);

  console.error("[2/4] Filtering to lifting-relevant entries...");
  const relevant = apiEntries.filter(isLiftingRelevant);
  console.error(`      ${relevant.length} entries survived filtering.`);

  console.error("[3/4] Preserving existing IDs (with enrichment)...");
  const preservedIds = new Set(PRESERVED.map((p) => p.id));
  const preservedEntries = [];
  let enrichedCount = 0;
  const unmatched = [];
  for (const p of PRESERVED) {
    const match = findBestApiMatch(p.id, relevant);
    if (match) {
      preservedEntries.push(buildEnrichedFromApi(p, match));
      enrichedCount += 1;
    } else {
      preservedEntries.push(buildEnrichedFromApi(p, null));
      unmatched.push(p.id);
    }
  }
  console.error(`      Enriched ${enrichedCount}/${PRESERVED.length} preserved entries.`);
  if (unmatched.length > 0) {
    console.error(`      Left bare (no API match): ${unmatched.join(", ")}`);
  }

  // Mark the API entries already consumed by preservation so we don't dupe them.
  const consumedApiIds = new Set();
  for (const entry of preservedEntries) {
    if (entry.apiId) consumedApiIds.add(entry.apiId);
  }

  console.error("[4/4] Filling out per muscle group...");

  // Bucket the relevant entries by muscle group.
  const buckets = new Map();
  for (const group of MUSCLE_GROUPS_IN_ORDER) buckets.set(group, []);
  for (const ex of relevant) {
    if (consumedApiIds.has(ex.exerciseId)) continue;
    const group = mapMuscle(ex.targetMuscles);
    if (!group) continue;
    const bucket = buckets.get(group);
    if (bucket) bucket.push(ex);
  }

  // Sort buckets: shorter names first (favours "bench press" over variants).
  for (const [, arr] of buckets) {
    arr.sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name));
  }

  // For each muscle group, append up to PER_MUSCLE_CAP entries whose slug-id
  // isn't already a preserved id.
  const addedEntries = [];
  const addedSlugs = new Set(preservedIds);
  const muscleCounts = {};
  for (const group of MUSCLE_GROUPS_IN_ORDER) muscleCounts[group] = 0;

  for (const group of MUSCLE_GROUPS_IN_ORDER) {
    const bucket = buckets.get(group) ?? [];
    let added = 0;
    for (const ex of bucket) {
      if (added >= PER_MUSCLE_CAP) break;
      const slug = slugify(ex.name);
      if (!slug) continue;
      if (addedSlugs.has(slug)) continue;
      const category = inferCategory(ex.name, ex.equipments);
      addedEntries.push(buildFromApi(ex, group, category));
      addedSlugs.add(slug);
      added += 1;
    }
    muscleCounts[group] = added;
  }

  console.error(`      Added ${addedEntries.length} new entries.`);

  // Also count preservation distribution by muscle for reporting.
  const totalByMuscle = {};
  for (const group of MUSCLE_GROUPS_IN_ORDER) totalByMuscle[group] = 0;
  for (const e of preservedEntries) {
    if (totalByMuscle[e.primaryMuscle] !== undefined) totalByMuscle[e.primaryMuscle] += 1;
  }
  for (const e of addedEntries) {
    if (totalByMuscle[e.primaryMuscle] !== undefined) totalByMuscle[e.primaryMuscle] += 1;
  }

  const allEntries = [...preservedEntries, ...addedEntries];

  // Sanity: every preserved id is present.
  for (const p of PRESERVED) {
    if (!allEntries.find((e) => e.id === p.id)) {
      throw new Error(`Lost preserved id "${p.id}" during build — aborting.`);
    }
  }

  // Sanity: no dup ids.
  const seen = new Set();
  for (const e of allEntries) {
    if (seen.has(e.id)) throw new Error(`Duplicate id "${e.id}" in output.`);
    seen.add(e.id);
  }

  const source = emitFile(allEntries);
  await writeFile(OUT_PATH, source, "utf8");

  console.error("");
  console.error("=== SUMMARY ===");
  console.error(`Preserved: ${preservedEntries.length}/${PRESERVED.length}`);
  console.error(`Enriched:  ${enrichedCount}/${PRESERVED.length}`);
  if (unmatched.length > 0) console.error(`Bare:      ${unmatched.join(", ")}`);
  console.error(`Added:     ${addedEntries.length}`);
  console.error(`Total:     ${allEntries.length}`);
  console.error(`By muscle: ${JSON.stringify(totalByMuscle)}`);
  console.error(`Wrote:     ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
