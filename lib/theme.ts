import type { Theme } from './types';

// Applies the light/dark/auto theme by stamping `data-theme` on <html>. CSS
// keys off `:root[data-theme="dark"]` / `["light"]`. "auto" follows the OS via
// matchMedia and updates live when the OS theme changes.

let mql: MediaQueryList | undefined;
let onChange: (() => void) | undefined;

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;

  // Tear down any previous "auto" listener before switching modes.
  if (mql && onChange) {
    mql.removeEventListener('change', onChange);
    mql = undefined;
    onChange = undefined;
  }

  if (theme === 'auto') {
    mql = window.matchMedia('(prefers-color-scheme: dark)');
    onChange = () => root.setAttribute('data-theme', mql!.matches ? 'dark' : 'light');
    onChange();
    mql.addEventListener('change', onChange);
  } else {
    root.setAttribute('data-theme', theme);
  }
}
