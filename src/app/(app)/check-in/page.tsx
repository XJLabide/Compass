"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * `/check-in` legacy route.
 * Automatically redirects to `/today`, preserving any `?date=` query parameters.
 */
export default function CheckInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const queryStr = params.toString();
    router.replace(queryStr ? `/today?${queryStr}` : "/today");
  }, [router, searchParams]);

  return null;
}
