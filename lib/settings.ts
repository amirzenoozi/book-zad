import { DEFAULT_SETTINGS, type Settings } from './types';

// User preferences, stored in `storage.sync` so they roam with the browser
// profile. Kept separate from per-device bookmark metadata in `storage.local`.

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const data = await browser.storage.sync.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(data[KEY] as Partial<Settings> | undefined) };
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.sync.set({ [KEY]: next });
  return next;
}
