export function duration(seconds: number): string {
  const value = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = String(value % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function views(count: number): string {
  return count >= 10000 ? `${(count / 10000).toFixed(1)}万` : String(count);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '出了点问题，请稍后重试。';
}
