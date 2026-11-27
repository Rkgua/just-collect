export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function seekFromDrag(start: number, dx: number, width: number, length: number): number {
  const span = Math.max(30, Math.min(180, length / 4));
  return clamp(start + (dx / Math.max(1, width)) * span, 0, Math.max(0, length));
}

export function gestureAxis(dx: number, dy: number, fullscreen: boolean): 'seek' | 'level' | null {
  if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.3) return 'seek';
  if (fullscreen && Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx) * 1.3) return 'level';
  return null;
}

export function cancelSeekAtCorner(x: number, y: number, width: number): boolean {
  return y < 36 && (x < width * 0.18 || x > width * 0.82);
}
