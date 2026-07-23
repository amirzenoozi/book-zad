import type { BookmarkMeta, Signals } from './types';

// Turns raw usage signals into a 0–100 "importance" score. The user can always
// override it with a manual score (see `effectiveScore`).

const DAY = 24 * 60 * 60 * 1000;

/**
 * Auto score in [0, 100] from usage signals:
 *   - visits  (50%): how often the user opens it, saturating around ~20 visits.
 *   - recency (30%): exponential decay, ~30-day half-life since the last visit.
 *   - dwell   (20%): total foreground time, saturating around 10 minutes.
 */
export function computeAutoScore(signals: Signals, now: number): number {
  const visitScore = Math.min(1, Math.log2(1 + signals.visits) / Math.log2(1 + 20));

  let recencyScore = 0;
  if (signals.lastVisit > 0) {
    const days = Math.max(0, (now - signals.lastVisit) / DAY);
    recencyScore = Math.exp(-days / 30);
  }

  const dwellScore = Math.min(1, signals.dwellMs / (10 * 60 * 1000));

  const raw = 0.5 * visitScore + 0.3 * recencyScore + 0.2 * dwellScore;
  return Math.round(100 * raw);
}

/** The score to rank by: the manual override if set, otherwise the auto score. */
export function effectiveScore(meta: BookmarkMeta, now: number): number {
  return meta.manualScore ?? computeAutoScore(meta.signals, now);
}
