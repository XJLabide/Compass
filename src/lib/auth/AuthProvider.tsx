"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { isAllowed } from "@/lib/auth/allowlist";
import { ensureSeeded } from "@/lib/db/seed";

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  // First-run seed: when an allowlisted user signs in, idempotently create
  // their profile/program/exercises. `ensureSeeded` no-ops on subsequent
  // sign-ins (it checks for an existing profile doc before writing).
  useEffect(() => {
    if (!user) return;
    if (!isAllowed(user.email)) return;
    let cancelled = false;
    void (async () => {
      try {
        await ensureSeeded(user);
      } catch (err) {
        if (cancelled) return;
        // Don't block the app on seed failure — surface to console so we can
        // diagnose. Subsequent sign-ins will retry (no profile = re-seed).
        console.error("[seed] ensureSeeded failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const signInGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    if (isStandalonePwa()) {
      // iOS standalone PWAs block popups; redirect is the reliable fallback.
      await signInWithRedirect(auth, provider);
      return;
    }
    await signInWithPopup(auth, provider);
  }, []);

  const signInEmail = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const signOut = useCallback(async () => {
    const auth = getFirebaseAuth();
    await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, signInGoogle, signInEmail, signOut }),
    [user, loading, signInGoogle, signInEmail, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
