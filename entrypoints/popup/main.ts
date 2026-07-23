import { getSettings, setSettings } from '@/lib/settings';
import { getLastSaveFolder, setLastSaveFolder } from '@/lib/storage';
import { loadTree, createBookmark, findByUrl } from '@/lib/bookmarks';
import { applyTheme } from '@/lib/theme';
import { openManager } from '@/lib/manager';
import type { Folder, Settings, Theme } from '@/lib/types';
import '@/lib/fonts.css';
import './style.css';

// The toolbar popup: a launcher for the manager plus quick configuration —
// nudge/toast toggles, the suggestion threshold, and theme. Full bookmark
// management lives in the manager page (opened via the button below).

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let settings: Settings;

init();

async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);

  const nudge = $<HTMLInputElement>('#set-nudge');
  const toast = $<HTMLInputElement>('#set-toast');
  const threshold = $<HTMLInputElement>('#set-threshold');
  const thresholdValue = $<HTMLElement>('#threshold-value');
  const theme = $<HTMLSelectElement>('#set-theme');

  // Reflect current settings.
  nudge.checked = settings.nudgeEnabled;
  toast.checked = settings.toastEnabled;
  threshold.value = String(Math.round(settings.similarityThreshold * 100));
  thresholdValue.textContent = threshold.value + '%';
  theme.value = settings.theme;

  // Persist on change.
  nudge.addEventListener('change', async () => {
    settings = await setSettings({ nudgeEnabled: nudge.checked });
  });
  toast.addEventListener('change', async () => {
    settings = await setSettings({ toastEnabled: toast.checked });
  });
  threshold.addEventListener('input', () => {
    thresholdValue.textContent = threshold.value + '%';
  });
  threshold.addEventListener('change', async () => {
    settings = await setSettings({ similarityThreshold: Number(threshold.value) / 100 });
  });
  theme.addEventListener('change', async () => {
    const value = theme.value as Theme;
    applyTheme(value);
    settings = await setSettings({ theme: value });
  });

  $('#open-manager').addEventListener('click', async () => {
    await openManager();
    window.close();
  });

  await wireQuickAdd();
}

/** "Save this page" — fills the current tab's title/url, a folder picker and a
 *  duplicate check, then creates a native bookmark in the chosen folder. */
async function wireQuickAdd() {
  const section = $('#save');
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  const url = tab?.url ?? '';
  const title = tab?.title ?? '';
  if (!/^https?:\/\//.test(url)) return; // not a savable page — keep section hidden

  const host = hostOf(url);
  const mono = $('#save-mono');
  mono.textContent = (host[0] ?? '•').toUpperCase();
  mono.style.background = `hsl(${hashHue(host)} 62% 52%)`;
  $('#save-title').textContent = title || url;
  $('#save-url').textContent = prettyUrl(url);

  const folderSel = $<HTMLSelectElement>('#save-folder');
  const { folders } = await loadTree();
  const sorted = [...folders].sort((a: Folder, b: Folder) => a.folderPath.localeCompare(b.folderPath));
  for (const f of sorted) {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.folderPath;
    folderSel.append(opt);
  }
  const last = await getLastSaveFolder();
  if (last && sorted.some((f) => f.id === last)) folderSel.value = last;

  const status = $('#save-status');
  const btn = $<HTMLButtonElement>('#save-btn');

  const existing = await findByUrl(url);
  if (existing.length > 0) {
    setStatus(status, `Already saved in “${existing[0]!.folderPath || 'a folder'}”`, 'dup');
  }

  btn.addEventListener('click', async () => {
    const parentId = folderSel.value;
    if (!parentId || btn.disabled) return;
    btn.disabled = true;
    try {
      await createBookmark(parentId, title || url, url);
      await setLastSaveFolder(parentId);
      const path = sorted.find((f) => f.id === parentId)?.folderPath ?? 'folder';
      setStatus(status, `Saved to “${path}” ✓`, 'ok');
      btn.textContent = 'Saved';
    } catch {
      setStatus(status, 'Could not save this page.', 'dup');
      btn.disabled = false;
    }
  });

  section.hidden = false;
}

function setStatus(el: HTMLElement, text: string, kind: 'ok' | 'dup') {
  el.textContent = text;
  el.className = `save__status save__status--${kind}`;
  el.hidden = false;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '•';
  }
}

function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, '') + (u.pathname === '/' ? '' : u.pathname);
  } catch {
    return url;
  }
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
