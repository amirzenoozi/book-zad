import type { FolderMatch } from './types';

// An in-page nudge, shown only when the user enables toasts in settings. It
// stays until the user acts on it or closes it — it never auto-dismisses.
// Rendered in a shadow root with inlined styles so nothing leaks in or out of
// the host page. Theme follows the host OS via prefers-color-scheme.

const HOST_ID = 'bookzad-toast-host';

export interface ToastActions {
  /** Add the current page to the matched folder. Resolves true on success. */
  onAdd: () => Promise<boolean>;
  /** Open the manager focused on the matched folder. */
  onOpen: () => void;
}

export function showToast(match: FolderMatch, actions: ToastActions): void {
  if (document.getElementById(HOST_ID)) return; // already showing
  if (!document.body) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  const pct = Math.round(match.score * 100);
  const samples = match.sampleTitles.slice(0, 3).map(escapeHtml).join(' · ');
  const folderName = match.folderPath.split(' / ').pop() ?? match.folderPath;

  shadow.innerHTML = `
    <style>
      ${fontFace()}
      :host { all: initial; }
      .card {
        position: fixed; bottom: 20px; right: 20px; width: 330px; z-index: 2147483647;
        font: 13px/1.45 "Vazirmatn", -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
        background: #ffffff; color: #10151b; border: 1px solid #dde3ea;
        border-radius: 12px; box-shadow: 0 8px 30px rgba(12, 15, 20, 0.18);
        padding: 14px 16px;
      }
      @media (prefers-color-scheme: dark) {
        .card { background: #151a21; color: #e6edf3; border-color: #232b35;
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5); }
        .btn { background: #1b2129; color: #e6edf3; border-color: #232b35; }
        .btn--primary { background: #46bea0; color: #04120e; border-color: #46bea0; }
      }
      .head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding-right: 22px; }
      .dot { width: 8px; height: 8px; border-radius: 50%; background: #46bea0; flex: none;
             box-shadow: 0 0 0 0 rgba(70, 190, 160, 0.6); animation: pulse 2s infinite; }
      @keyframes pulse {
        0% { box-shadow: 0 0 0 0 rgba(70, 190, 160, 0.5); }
        70% { box-shadow: 0 0 0 7px rgba(70, 190, 160, 0); }
        100% { box-shadow: 0 0 0 0 rgba(70, 190, 160, 0); }
      }
      .title { font-weight: 600; letter-spacing: 0.2px; }
      .pct { margin-left: auto; font-size: 11px; opacity: 0.7;
             font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
      .path { font-weight: 600; margin: 2px 0 6px; }
      .samples { opacity: 0.75; font-size: 12px; margin-bottom: 12px; }
      .actions { display: flex; gap: 8px; }
      .btn {
        flex: 1; padding: 8px 10px; border-radius: 8px; cursor: pointer;
        font: inherit; font-size: 12px; font-weight: 600;
        background: #eef1f4; color: #10151b; border: 1px solid #dde3ea;
      }
      .btn:hover { filter: brightness(0.97); }
      .btn:disabled { opacity: 0.6; cursor: default; }
      .btn--primary { background: #1f9e86; color: #ffffff; border-color: #1f9e86; }
      .close {
        position: absolute; top: 8px; right: 10px; cursor: pointer;
        background: none; border: none; color: inherit; opacity: 0.5; font-size: 16px;
      }
      .close:hover { opacity: 1; }
      .done { color: #1f9e86; font-weight: 600; }
      @media (prefers-color-scheme: dark) { .done { color: #46bea0; } }
    </style>
    <div class="card" role="status">
      <button class="close" aria-label="Dismiss">×</button>
      <div class="head">
        <span class="dot"></span>
        <span class="title">Looks familiar</span>
        <span class="pct">${pct}% match</span>
      </div>
      <div class="path">${escapeHtml(match.folderPath)}</div>
      <div class="samples">${samples}</div>
      <div class="actions">
        <button class="btn btn--primary" data-act="add">+ Add to ${escapeHtml(folderName)}</button>
        <button class="btn" data-act="open">Open folder</button>
      </div>
    </div>`;

  const remove = () => host.remove();
  const card = shadow.querySelector('.card')!;
  const addBtn = shadow.querySelector<HTMLButtonElement>('[data-act="add"]')!;

  shadow.querySelector('.close')?.addEventListener('click', remove);
  shadow.querySelector('[data-act="open"]')?.addEventListener('click', () => {
    actions.onOpen();
    remove();
  });
  addBtn.addEventListener('click', async () => {
    addBtn.disabled = true;
    addBtn.textContent = 'Adding…';
    const ok = await actions.onAdd();
    if (ok) {
      // Confirm inline, then dismiss shortly after.
      const actionsRow = shadow.querySelector('.actions')!;
      actionsRow.innerHTML = `<span class="done">✓ Added to ${escapeHtml(folderName)}</span>`;
      setTimeout(remove, 2200);
    } else {
      addBtn.disabled = false;
      addBtn.textContent = 'Retry add';
    }
  });

  // Guard against the (rare) host page nuking our node — nothing else to do.
  void card;
  document.body.append(host);
}

// Persian/Arabic Unicode range — keep in sync with lib/fonts.css.
const VAZIR_RANGE =
  'U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0897-08E1,U+08E3-08FF,' +
  'U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC';

const FONT_PATHS = {
  400: '/fonts/vazirmatn-arabic-400-normal.woff2',
  600: '/fonts/vazirmatn-arabic-600-normal.woff2',
  700: '/fonts/vazirmatn-arabic-700-normal.woff2',
} as const;

/** @font-face rules for the shadow root, pointing at the bundled Vazirmatn
 *  files via web-accessible extension URLs (host pages can't see our CSS). */
function fontFace(): string {
  return (Object.keys(FONT_PATHS) as unknown as Array<keyof typeof FONT_PATHS>)
    .map((weight) => {
      const url = browser.runtime.getURL(FONT_PATHS[weight]);
      return `@font-face {
        font-family: 'Vazirmatn'; font-style: normal; font-weight: ${weight};
        font-display: swap; src: url('${url}') format('woff2');
        unicode-range: ${VAZIR_RANGE};
      }`;
    })
    .join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
