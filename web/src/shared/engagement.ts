export function compactCount(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
    .format(value)
    .toLowerCase();
}
export function elapsedMonths(released: number, now: number): number {
  const from = new Date(released * 1000),
    to = new Date(now * 1000);
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth();
  if (to.getUTCDate() < from.getUTCDate()) months--;
  return Math.max(0, months);
}
