"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import WorkoutPage from "../../workout/page";

/**
 * Curated Weight Lifting Hub (`/fitness/weight-lifting`).
 * Wraps the full strength rotation logger with consistent Fitness navigation.
 */
export default function CuratedWeightLiftingPage() {
  return (
    <div>
      <div className="mb-4">
        <Link
          href="/fitness"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Fitness Hub
        </Link>
      </div>
      <WorkoutPage />
    </div>
  );
}
