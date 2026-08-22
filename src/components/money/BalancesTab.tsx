"use client";

import { useEffect, useState } from "react";
import { addDoc, deleteDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { Plus, Wallet, Edit2, Trash2 } from "lucide-react";

import { accountPath, accountsPath } from "@/lib/db/paths";
import type { AccountBalanceDoc, AccountType } from "@/lib/db/types";
import CompassLoader from "@/components/ui/CompassLoader";
import { formatCurrencyAmount, getCurrencySymbol } from "@/lib/money/currency";
import { isLegacySeededAccount } from "@/lib/money/legacyFinanceSeeds";

export interface AccountRow {
  id: string;
  data: AccountBalanceDoc;
}

export default function BalancesTab({
  uid,
  userCurrency = "PHP",
  hideAmounts = false,
}: {
  uid: string;
  userCurrency?: string;
  hideAmounts?: boolean;
}) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountRow | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  // Subscribe to user accounts
  useEffect(() => {
    setAccounts(null);
    if (!uid) return;
    const unsub = onSnapshot(accountsPath(uid), (snap) => {
      const rows = snap.docs.flatMap((d) => {
        const data = d.data();
        if (isLegacySeededAccount(data)) {
          void deleteDoc(d.ref);
          return [];
        }
        return [{ id: d.id, data }];
      });
      setAccounts(rows);
    });
    return unsub;
  }, [uid, userCurrency]);

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !name) return;
    setSaving(true);

    try {
      const num = parseFloat(balance);
      const balanceMinor = Number.isFinite(num) ? Math.round(num * 100) : 0;

      if (editAccount) {
        await setDoc(
          accountPath(uid, editAccount.id),
          {
            name: name.trim(),
            type,
            balanceMinor,
            currency: userCurrency,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        await addDoc(accountsPath(uid), {
          name: name.trim(),
          type,
          balanceMinor,
          currency: userCurrency,
          updatedAt: serverTimestamp(),
        });
      }

      setModalOpen(false);
      setEditAccount(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to save account:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!uid) return;
    try {
      await deleteDoc(accountPath(uid, id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete account:", err);
    }
  };

  if (!accounts) {
    return <CompassLoader mode="card" size="lg" label="Loading Accounts..." />;
  }

  const totalLiquid = accounts.reduce((acc, a) => acc + a.data.balanceMinor / 100, 0);

  return (
    <div className="space-y-6">
      {/* Liquid Cash Summary Card */}
      <div className="rounded-xl border border-border bg-neutral-900/60 p-5 backdrop-blur-md flex items-center justify-between">
        <div>
          <span className="text-xs font-medium uppercase tracking-wider text-muted">
            Total Liquid Cash & Balances
          </span>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-100">
            {formatCurrencyAmount(totalLiquid, userCurrency, 2, hideAmounts)}
          </h2>
        </div>
        <button
          onClick={() => {
            setEditAccount(null);
            setName("");
            setType("checking");
            setBalance("");
            setModalOpen(true);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-xs font-semibold text-accent-foreground transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Add Account
        </button>
      </div>

      {/* Account Cards Grid */}
      {accounts.length === 0 ? (
        <div className="rounded-xl border border-border/50 p-6 text-center text-xs text-muted">
          No accounts added yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => {
          const bal = acc.data.balanceMinor / 100;
          return (
            <div
              key={acc.id}
              className="flex flex-col justify-between rounded-xl border border-border bg-neutral-900/40 p-4 transition hover:bg-neutral-800/40 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
                    <Wallet className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-neutral-100">{acc.data.name}</h4>
                    <span className="text-[10px] uppercase font-semibold text-muted tracking-wider">
                      {acc.data.type}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-baseline justify-between pt-2 border-t border-border/50">
                <span className="text-2xl font-bold text-neutral-100">
                  {formatCurrencyAmount(bal, userCurrency, 2, hideAmounts)}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditAccount(acc);
                      setName(acc.data.name);
                      setType(acc.data.type);
                      setBalance(bal.toString());
                      setModalOpen(true);
                    }}
                    className="text-muted hover:text-cyan-400 transition p-1"
                    title="Edit account balance"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(acc.id)}
                    className="text-muted hover:text-rose-400 transition p-1"
                    title="Delete account"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}

      {/* Account Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-100">
              {editAccount ? "Update Account Balance" : "Add Account"}
            </h3>

            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="Account name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">Account Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as AccountType)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                    <option value="emergency">Emergency Fund</option>
                    <option value="cash">Physical Cash</option>
                    <option value="credit">Credit / Debt</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted">Balance ({getCurrencySymbol(userCurrency)})</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="0.00"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  {saving ? "Saving..." : editAccount ? "Update Balance" : "Add Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
