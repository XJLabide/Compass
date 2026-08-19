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
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";

export type AuthContextValue = {
  user: User | null;
  loading: boolean;
  redirectError: string | null;
  clearRedirectError: () => void;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const displayModeStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const navigatorStandalone =
    "standalone" in window.navigator &&
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return displayModeStandalone || navigatorStandalone;
}

function describeAuthError(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled for this Firebase project. Enable the Google provider in Firebase Authentication, then try again.";
    case "auth/network-request-failed":
      return "Google sign-in could not finish because the network request failed. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "This app domain is not authorized in Firebase Authentication.";
    case "auth/web-storage-unsupported":
      return "This browser mode is blocking the storage Firebase needs to finish Google sign-in.";
    default:
      return code ? `Google sign-in failed (${code}).` : "Google sign-in failed. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    void getRedirectResult(auth).catch((err: unknown) => {
      setRedirectError(describeAuthError(err));
    });
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInGoogle = useCallback(async () => {
    const auth = getFirebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
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

  const clearRedirectError = useCallback(() => {
    setRedirectError(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      redirectError,
      clearRedirectError,
      signInGoogle,
      signInEmail,
      signOut,
    }),
    [
      user,
      loading,
      redirectError,
      clearRedirectError,
      signInGoogle,
      signInEmail,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
