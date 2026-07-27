/**
 * Single source of truth for currency formatting across Compass.
 * Supports privacy mode (masking amounts when hidden).
 */

export function getCurrencySymbol(currency: string = "PHP"): string {
  if (!currency || currency === "PHP" || currency === "USD") return "₱";
  if (currency === "EUR") return "€";
  if (currency === "GBP") return "£";
  return currency;
}

export function formatCurrencyAmount(
  amount: number,
  currency: string = "PHP",
  decimals: number = 2,
  hideAmounts: boolean = false,
): string {
  if (hideAmounts) {
    return `${getCurrencySymbol(currency)} ••••••`;
  }
  const symbol = getCurrencySymbol(currency);
  const formatted = Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${amount < 0 ? "-" : ""}${symbol}${formatted}`;
}

export function formatMinorMoney(
  minor: number,
  currency: string = "PHP",
  hideAmounts: boolean = false,
): string {
  return formatCurrencyAmount(minor / 100, currency, 2, hideAmounts);
}
