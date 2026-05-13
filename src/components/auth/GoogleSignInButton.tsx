"use client";

import { useState } from "react";
import clsx from "clsx";

type Props = {
  onSignIn: () => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
};

export default function GoogleSignInButton({
  onSignIn,
  onError,
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      await onSignIn();
      // On popup path, AuthProvider's onAuthStateChanged will route us out.
      // On redirect path, the browser navigates away; no further work here.
    } catch (err) {
      onError(mapGoogleError(err));
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      aria-busy={busy}
      className={clsx(
        "flex h-12 w-full items-center justify-center gap-3 rounded-lg",
        "border border-border bg-panel2 px-4 text-sm font-medium text-neutral-100",
        "transition-colors hover:bg-panel disabled:opacity-60 disabled:cursor-not-allowed",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      )}
    >
      <GoogleGlyph aria-hidden="true" />
      <span>{busy ? "Signing in…" : "Continue with Google"}</span>
    </button>
  );
}

function mapGoogleError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/popup-blocked":
      return "Popup blocked by your browser. Allow popups and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/internal-error":
      return "Something went wrong. Please try again.";
    default:
      return code
        ? `Sign-in failed (${code}).`
        : "Sign-in failed. Please try again.";
  }
}

function GoogleGlyph(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.96H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.04l3.007-2.333z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.96L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
