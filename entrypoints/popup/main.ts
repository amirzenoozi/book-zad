import { getSettings, setSettings } from '@/lib/settings';
import { applyTheme } from '@/lib/theme';
import { openManager } from '@/lib/manager';
import type { Settings, Theme } from '@/lib/types';
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
}
