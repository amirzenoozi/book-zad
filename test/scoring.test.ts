import { describe, it, expect } from 'vitest';
import { computeAutoScore, effectiveScore } from '@/lib/scoring';
import { DEFAULT_META, type Signals } from '@/lib/types';

const now = 1_700_000_000_000;
const sig = (s: Partial<Signals>): Signals => ({ visits: 0, lastVisit: 0, dwellMs: 0, ...s });

describe('computeAutoScore', () => {
  it('stays within 0..100', () => {
    const zero = computeAutoScore(sig({}), now);
    const maxed = computeAutoScore(sig({ visits: 999, lastVisit: now, dwellMs: 9e9 }), now);
    expect(zero).toBeGreaterThanOrEqual(0);
    expect(maxed).toBeLessThanOrEqual(100);
  });

  it('rises with more visits', () => {
    const few = computeAutoScore(sig({ visits: 1, lastVisit: now }), now);
    const many = computeAutoScore(sig({ visits: 15, lastVisit: now }), now);
    expect(many).toBeGreaterThan(few);
  });

  it('decays as the last visit recedes', () => {
    const recent = computeAutoScore(sig({ visits: 5, lastVisit: now }), now);
    const old = computeAutoScore(sig({ visits: 5, lastVisit: now - 120 * 24 * 3600 * 1000 }), now);
    expect(recent).toBeGreaterThan(old);
  });
});

describe('effectiveScore', () => {
  it('uses the manual score when set, ignoring signals', () => {
    const m = { ...DEFAULT_META, manualScore: 80, signals: sig({ visits: 0 }) };
    expect(effectiveScore(m, now)).toBe(80);
  });

  it('falls back to the auto score when no manual score', () => {
    const m = { ...DEFAULT_META, manualScore: null, signals: sig({ visits: 10, lastVisit: now }) };
    expect(effectiveScore(m, now)).toBe(computeAutoScore(m.signals, now));
  });
});
