import { describe, it, expect } from 'vitest';
import { tokenize, termFrequencies } from '@/lib/text';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumerics', () => {
    expect(tokenize('Movies, TV-Shows!')).toEqual(['movies', 'shows']); // "tv" is < 3 chars
  });

  it('drops stop-words, url noise, short tokens and pure numbers', () => {
    const toks = tokenize('The best https://www.example.com/page 2024 review');
    expect(toks).toContain('best');
    expect(toks).toContain('example');
    expect(toks).toContain('review');
    expect(toks).not.toContain('the'); // stop-word
    expect(toks).not.toContain('https'); // url noise
    expect(toks).not.toContain('www');
    expect(toks).not.toContain('com');
    expect(toks).not.toContain('2024'); // pure number
  });

  it('keeps Persian tokens', () => {
    const toks = tokenize('فیلم سینما مووی');
    expect(toks).toContain('فیلم');
    expect(toks).toContain('سینما');
  });

  it('termFrequencies counts occurrences', () => {
    expect(termFrequencies(['a', 'b', 'a', 'a'])).toEqual({ a: 3, b: 1 });
  });
});
