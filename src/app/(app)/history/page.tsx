"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * `/history` legacy route.
 * Automatically redirects to `/today` which houses the date selector & archive browsing.
 */
export default function HistoryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/today");
  }, [router]);

  return null;
}
