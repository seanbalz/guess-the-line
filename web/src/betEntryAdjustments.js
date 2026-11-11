// Manual ticket controls only. Never reads a quote or changes a writer's limits.
export function adjustTicketOdds(value, direction) {
  if (value === '' || value == null || ![-1, 1].includes(direction)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.abs(n) < 100 || Math.abs(n) > 1000000 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-7) return null;
  // +100 and −100 are equivalent. Cross even money without offering invalid prices.
  const next = Math.round(((n < 0 ? n + 100 : n - 100) + direction * 5) * 100) / 100;
  const result = next < 0 ? next - 100 : next + 100;
  return Math.abs(result) <= 1000000 ? result : null;
}

export function adjustTicketUnits(value, direction, min = 0.0001, max = 10000) {
  if (value === '' || value == null || ![-1, 1].includes(direction)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max || Math.abs(n * 10000 - Math.round(n * 10000)) > 1e-7) return null;
  const next = Math.max(Math.round(min * 10000), Math.round(n * 10000) + direction * 1000);
  return next <= max * 10000 && next !== Math.round(n * 10000) ? next / 10000 : null;
}
