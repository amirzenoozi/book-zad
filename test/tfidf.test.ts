import { describe, it, expect } from 'vitest';
import { buildIdf, tfidf, cosine, mergeTf, scaleTf, type TermMap } from '@/lib/tfidf';
import { termFrequencies } from '@/lib/text';

describe('tfidf', () => {
  it('cosine is 1 for identical vectors and 0 for disjoint ones', () => {
    const a: TermMap = { movie: 2, film: 1 };
    const b: TermMap = { movie: 4, film: 2 }; // same direction, different scale
    expect(cosine(a, b)).toBeCloseTo(1, 6);
    expect(cosine({ movie: 1 }, { tax: 1 })).toBe(0);
  });

  it('cosine is symmetric and bounded in [0,1] for non-negative weights', () => {
    const a: TermMap = { a: 1, b: 2, c: 3 };
    const b: TermMap = { b: 1, c: 1, d: 5 };
    const s = cosine(a, b);
    expect(cosine(b, a)).toBeCloseTo(s, 12);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('idf gives rarer terms more weight', () => {
    const docs: TermMap[] = [{ common: 1, rare: 1 }, { common: 1 }, { common: 1 }];
    const idf = buildIdf(docs);
    expect(idf.weights.rare!).toBeGreaterThan(idf.weights.common!);
  });

  it('mergeTf sums counts and scaleTf multiplies them', () => {
    expect(mergeTf([{ a: 1, b: 2 }, { a: 3 }])).toEqual({ a: 4, b: 2 });
    expect(scaleTf({ a: 2, b: 1 }, 3)).toEqual({ a: 6, b: 3 });
  });

  it('a note-weighted term dominates the tf-idf vector', () => {
    const plain = termFrequencies(['alpha', 'beta']);
    const boosted = mergeTf([plain, scaleTf(termFrequencies(['beta']), 5)]);
    const idf = buildIdf([plain, boosted]);
    const v = tfidf(boosted, idf);
    expect(v.beta!).toBeGreaterThan(v.alpha!);
  });
});
