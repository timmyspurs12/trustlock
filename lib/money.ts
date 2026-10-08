/** Format a numeric amount the way PayPal expects it ("100.00"). */
export function toPayPalAmount(amount: number): string {
  return amount.toFixed(2);
}

/** Compare a PayPal amount string with a numeric amount (cent-safe). */
export function amountsEqual(paypalValue: string | undefined | null, amount: number): boolean {
  if (!paypalValue) return false;
  const parsed = Number.parseFloat(paypalValue);
  if (!Number.isFinite(parsed)) return false;
  return Math.abs(parsed - amount) < 0.005;
}
