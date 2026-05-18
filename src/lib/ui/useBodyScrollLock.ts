"use client";

import { useEffect } from "react";

/**
 * Lock body scroll while the calling component is mounted. Useful for
 * full-screen modal/overlay components so users don't get a "double scroll"
 * (body underneath scrolling while the modal also scrolls internally).
 *
 * Implementation notes:
 *   - We reference-count locks so multiple stacked overlays (e.g. a confirm
 *     dialog on top of a sheet) all share the same lock, and we only restore
 *     the page when the *last* one unmounts.
 *   - On iOS Safari, just setting `overflow: hidden` isn't enough — the page
 *     visibly snaps to top. To preserve scroll position we pin the body via
 *     `position: fixed; top: -scrollY; width: 100%` while locked, then
 *     restore both the styles and the original scroll position on unlock.
 *
 * Pass `active=false` to no-op (useful if you conditionally render the
 * overlay parent that uses the hook — keeps hook order stable).
 */
let lockCount = 0;
let savedScrollY = 0;
let savedBodyStyles: {
  overflow: string;
  position: string;
  top: string;
  width: string;
} | null = null;

function applyLock() {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    const body = document.body;
    savedBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.width = "100%";
  }
  lockCount += 1;
}

function releaseLock() {
  if (typeof document === "undefined") return;
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && savedBodyStyles) {
    const body = document.body;
    body.style.overflow = savedBodyStyles.overflow;
    body.style.position = savedBodyStyles.position;
    body.style.top = savedBodyStyles.top;
    body.style.width = savedBodyStyles.width;
    savedBodyStyles = null;
    // Restore the scroll position the user was at before the lock.
    window.scrollTo(0, savedScrollY);
    savedScrollY = 0;
  }
}

export function useBodyScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;
    applyLock();
    return () => releaseLock();
  }, [active]);
}
