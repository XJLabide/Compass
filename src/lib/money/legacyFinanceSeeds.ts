import type { AccountBalanceDoc, PortfolioHoldingDoc } from "@/lib/db/types";

const CENT_TOLERANCE = 0.01;

function closeTo(value: unknown, expected: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value - expected) <= CENT_TOLERANCE
  );
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

export function isLegacySeededPortfolioHolding(
  data: PortfolioHoldingDoc & { usdAmount?: number },
): boolean {
  const ticker = normalized(data.ticker);
  const name = normalized(data.name);
  const category = normalized(data.category);

  const isVooSeed =
    ticker === "VOO" &&
    name === "VANGUARD S&P 500 ETF" &&
    category === "ETF" &&
    closeTo(data.usdAmount, 471.39);

  const isQqqSeed =
    ticker === "QQQ" &&
    name === "INVESCO QQQ TRUST ETF" &&
    category === "ETF" &&
    closeTo(data.usdAmount, 54.98);

  return isVooSeed || isQqqSeed;
}

export function isLegacySeededAccount(data: AccountBalanceDoc): boolean {
  const name = normalized(data.name);
  const type = normalized(data.type);
  const currency = normalized(data.currency);

  const isCheckingSeed =
    name === "MAIN CHECKING" &&
    type === "CHECKING" &&
    currency === "PHP" &&
    data.balanceMinor === 250000;

  const isSavingsSeed =
    name === "HIGH-YIELD SAVINGS" &&
    type === "SAVINGS" &&
    currency === "PHP" &&
    data.balanceMinor === 500000;

  return isCheckingSeed || isSavingsSeed;
}
