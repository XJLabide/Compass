"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function NotAuthorizedPage() {
  const router = useRouter();
  const { signOut } = useAuth();

  const tryAnother = async () => {
    // Defensive: AuthGate signs the user out before routing here, but if the
    // user navigates directly we want to guarantee a clean slate.
    try {
      await signOut();
    } catch {
      // Ignore — signOut on an already-signed-out session is a no-op.
    }
    router.replace("/login");
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-3 pb-10 pt-[max(3.5rem,calc(env(safe-area-inset-top)+0.875rem))]">
      <h1 className="text-2xl font-semibold text-neutral-100">
        Not authorized
      </h1>
      <p className="mt-3 text-sm text-muted">
        This account could not access the app. We&apos;ve signed you out so you
        can try again.
      </p>
      <p className="mt-2 text-sm text-muted">
        If this keeps happening, use a different account or check your Firebase
        authentication setup.
      </p>

      <button
        type="button"
        onClick={tryAnother}
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-neutral-100 px-4 text-sm font-medium text-neutral-900 transition hover:bg-white"
      >
        Try a different account
      </button>
    </main>
  );
}
