import { defineExtensionMessaging } from '@webext-core/messaging';
import type { FolderMatch } from './types';

// Typed messages between the content script and the background worker.
// (The manager page talks to the browser APIs directly, not over this channel.)

/** Content script → background: "here's the page I'm reading, is it familiar?" */
export interface AnalyzePageRequest {
  url: string;
  title: string;
  /** Extracted readable page text (already length-capped). */
  text: string;
}

export interface AnalyzePageResult {
  /** Folders similar enough to nudge about, best match first (may be empty). */
  matches: FolderMatch[];
}

/** Content script → background: usage signal for the page's bookmark, if any. */
export interface RecordVisitRequest {
  url: string;
  title: string;
  /** Foreground dwell time accumulated for this visit, in ms. */
  dwellMs: number;
  /** Page tokens' term frequencies, to enrich the similarity index. */
  tokens: Record<string, number>;
}

/** Toast "Add here" → background creates the bookmark in the matched folder. */
export interface AddToFolderRequest {
  url: string;
  title: string;
  folderId: string;
}

export interface AddToFolderResult {
  ok: boolean;
}

/** Toast "Open folder" → background opens the manager focused on that folder. */
export interface OpenManagerRequest {
  folderId: string;
}

interface ProtocolMap {
  analyzePage(data: AnalyzePageRequest): AnalyzePageResult;
  recordVisit(data: RecordVisitRequest): void;
  addToFolder(data: AddToFolderRequest): AddToFolderResult;
  openManagerAt(data: OpenManagerRequest): void;
}

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
