export function monitoringSampleIsFresh(time: number | null, now = Date.now()): boolean {
  return time !== null && Number.isFinite(time) && time <= now + 60_000 && now - time <= 180_000;
}
