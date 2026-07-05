"use client";

import {
  collection,
  deleteDoc,
  getDocs,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

/**
 * Hard-delete every document the user owns under `users/{uid}/...`.
 *
 * Wipes (in order, leaf-first so subcollections die before parents):
 *  1. Nori thread messages (subcollections under each thread)
 *  2. Nori threads
 *  3. Each top-level subcollection: todos, expenses, routines, sessions,
 *     daily, exercises, prs, program, profile
 *
 * Uses writeBatch (capped at 500 ops) and chunks to stay safe with large
 * collections. Returns once Firestore acknowledges all writes.
 *
 * IMPORTANT: this is irreversible. The caller MUST gate behind a confirmation
 * dialog and ideally sign the user out afterwards so the next login can
 * trigger a fresh seed.
 */
const TOP_LEVEL_COLLECTIONS = [
  "todos",
  "expenses",
  "recurringFees",
  "routines",
  "sessions",
  "daily",
  "exercises",
  "prs",
  "program",
  "profile",
] as const;

const BATCH_LIMIT = 400; // stay well under Firestore's 500-op ceiling

async function deleteCollectionDocs(
  db: Firestore,
  parentPath: readonly [string, ...string[]],
  collectionName: string,
): Promise<number> {
  const colRef = collection(db, ...parentPath, collectionName);
  let deleted = 0;
  // Iterate in chunks so we don't blow up on collections with thousands of docs.
  // getDocs returns everything in the collection — fine for personal-tracker
  // scale (well under 10k docs total even after years of use).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await getDocs(colRef);
    if (snap.empty) break;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const chunk = docs.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
      deleted += chunk.length;
    }
    // If we deleted fewer than the page size, the collection is empty now.
    if (snap.docs.length < BATCH_LIMIT) break;
  }
  return deleted;
}

export interface WipeReport {
  /** Map of collection-name → docs removed. */
  counts: Record<string, number>;
  total: number;
}

export async function wipeAllUserData(uid: string): Promise<WipeReport> {
  const db = getFirebaseDb();
  const counts: Record<string, number> = {};
  let total = 0;

  // 1. Nori — delete each thread's messages, then the threads themselves.
  const noriThreadsSnap = await getDocs(
    collection(db, "users", uid, "noriThreads"),
  );
  let noriMessages = 0;
  for (const threadDoc of noriThreadsSnap.docs) {
    noriMessages += await deleteCollectionDocs(
      db,
      ["users", uid, "noriThreads", threadDoc.id],
      "messages",
    );
  }
  counts["noriThreads/messages"] = noriMessages;
  total += noriMessages;

  let noriThreadsDeleted = 0;
  for (const threadDoc of noriThreadsSnap.docs) {
    await deleteDoc(threadDoc.ref);
    noriThreadsDeleted += 1;
  }
  counts["noriThreads"] = noriThreadsDeleted;
  total += noriThreadsDeleted;

  // 2. Top-level subcollections.
  for (const name of TOP_LEVEL_COLLECTIONS) {
    const removed = await deleteCollectionDocs(db, ["users", uid], name);
    counts[name] = removed;
    total += removed;
  }

  return { counts, total };
}
