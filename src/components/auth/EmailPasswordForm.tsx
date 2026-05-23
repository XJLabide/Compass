"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";

type Props = {
  onSubmit: (email: string, password: string) => Promise<void>;
  onError: (message: string) => void;
  disabled?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailPasswordForm({
  onSubmit,
  onError,
  disabled,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || disabled) return;

    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);

    if (password.length === 0) {
      onError("Enter your password.");
      return;
    }

    setBusy(true);
    try {
      await onSubmit(trimmedEmail, password);
      setBusy(false);
    } catch (err) {
      onError(mapAuthError(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      <div>
        <label
          htmlFor="email"
          className="block text-xs font-medium text-muted"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError(null);
          }}
          aria-invalid={emailError ? "true" : undefined}
          aria-describedby={emailError ? "email-error" : undefined}
          className={clsx(
            "mt-1 block h-12 w-full rounded-lg border bg-white/5 px-3",
            "text-base text-neutral-100 placeholder:text-muted",
            "transition-colors focus:outline-none focus:border-accent focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/40",
            emailError ? "border-red-500" : "border-white/10",
          )}
          placeholder="you@example.com"
        />
        {emailError ? (
          <p id="email-error" className="mt-1 text-xs text-red-400">
            {emailError}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-xs font-medium text-muted"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={clsx(
            "mt-1 block h-12 w-full rounded-lg border border-white/10 bg-white/5 px-3",
            "text-base text-neutral-100 placeholder:text-muted",
            "transition-colors focus:outline-none focus:border-accent focus:bg-white/[0.07] focus:ring-2 focus:ring-accent/40",
          )}
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={busy || disabled}
        aria-busy={busy}
        className={clsx(
          "h-12 w-full rounded-lg bg-accent px-4 text-sm font-semibold text-bg",
          "transition duration-150 ease-out",
          "hover:brightness-110 hover:shadow-[0_0_28px_-8px_rgba(34,211,238,0.55)]",
          "active:scale-[0.99]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          "disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none",
        )}
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function mapAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address is not valid.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    default:
      return code ? `Sign-in failed (${code}).` : "Sign-in failed. Please try again.";
  }
}
