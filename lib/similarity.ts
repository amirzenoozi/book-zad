import { loadTree } from './bookmarks';
import { getManyMeta } from './storage';
import { tokenize, termFrequencies } from './text';
import { buildIdf, tfidf, cosine, mergeTf, scaleTf, type Idf, type TermMap } from './tfidf';
import type { FolderMatch } from './types';

// Builds a per-folder TF-IDF index from the bookmark tree and matches a page
// against it. A folder is represented by the centroid (summed term frequencies)
// of its bookmarks — title + url words, each bookmark's note, and any page
// tokens captured on past visits — plus the folder's own note. Notes are
// hand-written labels, so they're weighted more heavily than incidental words.

/** How much heavier a hand-written note counts than a title/url word. */
const BOOKMARK_NOTE_WEIGHT = 2;
const FOLDER_NOTE_WEIGHT = 3;

interface FolderEntry {
  folderId: string;
  folderPath: string;
  /** TF-IDF vector of the folder centroid. */
  vector: TermMap;
  sampleTitles: string[];
}

export interface FolderIndex {
  idf: Idf;
  folders: FolderEntry[];
}

export async function buildFolderIndex(): Promise<FolderIndex> {
  const { bookmarks, folders: folderNodes } = await loadTree();
  const bmMeta = await getManyMeta(bookmarks.map((b) => b.id));
  const folderMeta = await getManyMeta(folderNodes.map((f) => f.id));

  const docs: TermMap[] = [];
  const byFolder = new Map<string, { path: string; tfs: TermMap[]; titles: string[] }>();

  const ensureFolder = (folderId: string, path: string) => {
    let entry = byFolder.get(folderId);
    if (!entry) {
      entry = { path: path || '(top level)', tfs: [], titles: [] };
      byFolder.set(folderId, entry);
    }
    return entry;
  };

  for (const b of bookmarks) {
    const meta = bmMeta.get(b.id);
    const titleUrlTf = termFrequencies(tokenize(`${b.title} ${b.url}`));
    // Notes and tags are hand-written labels — weight them above incidental words.
    const labelText = `${meta?.notes ?? ''} ${(meta?.tags ?? []).join(' ')}`;
    const labelTf = scaleTf(termFrequencies(tokenize(labelText)), BOOKMARK_NOTE_WEIGHT);
    const tf = mergeTf([titleUrlTf, labelTf, meta?.tokens ?? {}]);
    docs.push(tf);

    const entry = ensureFolder(b.parentId ?? 'root', b.folderPath);
    entry.tfs.push(tf);
    if (entry.titles.length < 5) entry.titles.push(b.title);
  }

  // Fold each folder's own note into its centroid. Include folders that have a
  // note but no direct bookmarks yet, so labelling an empty folder still works.
  const folderNoteTf = new Map<string, TermMap>();
  for (const f of folderNodes) {
    const note = folderMeta.get(f.id)?.notes ?? '';
    if (!note.trim()) continue;
    const tf = scaleTf(termFrequencies(tokenize(note)), FOLDER_NOTE_WEIGHT);
    folderNoteTf.set(f.id, tf);
    docs.push(tf);
    ensureFolder(f.id, f.folderPath); // create an entry if the folder is empty
  }

  const idf = buildIdf(docs);
  const folders: FolderEntry[] = [];
  for (const [folderId, e] of byFolder) {
    const note = folderNoteTf.get(folderId);
    const centroid = note ? mergeTf([mergeTf(e.tfs), note]) : mergeTf(e.tfs);
    folders.push({
      folderId,
      folderPath: e.path,
      vector: tfidf(centroid, idf),
      sampleTitles: e.titles,
    });
  }

  return { idf, folders };
}

/** Rank folders by cosine similarity to the page text; keep those over the cut. */
export function matchPage(
  index: FolderIndex,
  text: string,
  threshold: number,
  topN = 3,
): FolderMatch[] {
  const queryVector = tfidf(termFrequencies(tokenize(text)), index.idf);
  return index.folders
    .map((f) => ({ f, score: cosine(queryVector, f.vector) }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => ({
      folderId: x.f.folderId,
      folderPath: x.f.folderPath,
      score: x.score,
      sampleTitles: x.f.sampleTitles,
    }));
}
