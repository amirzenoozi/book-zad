import { describe, it, expect } from 'vitest';
import { matchPage, type FolderIndex } from '@/lib/similarity';
import { buildIdf, tfidf } from '@/lib/tfidf';
import { tokenize, termFrequencies } from '@/lib/text';

const movie = termFrequencies(tokenize('movies films cinema series reviews trailers'));
const tax = termFrequencies(tokenize('tax invoice accounting finance receipts'));
const idf = buildIdf([movie, tax]);

const index: FolderIndex = {
  idf,
  folders: [
    { folderId: 'm', folderPath: 'Movies & Series', vector: tfidf(movie, idf), sampleTitles: ['IMDb'] },
    { folderId: 't', folderPath: 'Taxes', vector: tfidf(tax, idf), sampleTitles: ['IRS'] },
  ],
};

describe('matchPage', () => {
  it('ranks the topically closest folder first', () => {
    const matches = matchPage(index, 'the best new movies and film reviews this year', 0.02);
    expect(matches[0]?.folderId).toBe('m');
  });

  it('drops folders below the threshold', () => {
    const strict = matchPage(index, 'movies films', 0.99);
    expect(strict).toHaveLength(0);
  });

  it('returns nothing for unrelated text', () => {
    const matches = matchPage(index, 'gardening perennials soil compost', 0.1);
    expect(matches).toHaveLength(0);
  });

  it('honours the topN limit', () => {
    const matches = matchPage(index, 'movies tax films invoice', 0, 1);
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});
