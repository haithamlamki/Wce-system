// ============================================================================
//  Shared theme store — single source of truth for light/dark/auto, used by
//  both the WCE header cycle button and the Tubular module's 3-button toggle.
//  Applies the resolved theme to <html data-theme> (the attribute both the
//  WCE tokens in theme.css and the Tubular design system key off) and
//  persists the chosen mode.
// ============================================================================

export type ThemeMode = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'aemp_theme_v1';

let mode: ThemeMode = (() => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'auto') return saved;
  } catch { /* storage unavailable */ }
  return 'auto';
})();

const listeners = new Set<() => void>();
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;

function resolved(m: ThemeMode): 'light' | 'dark' {
  if (m === 'auto') return mq?.matches ? 'dark' : 'light';
  return m;
}

export function applyTheme(): void {
  document.documentElement.setAttribute('data-theme', resolved(mode));
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export function setThemeMode(next: ThemeMode): void {
  mode = next;
  try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  applyTheme();
  listeners.forEach((l) => l());
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// react to OS preference changes while in auto
mq?.addEventListener('change', () => {
  if (mode === 'auto') {
    applyTheme();
    listeners.forEach((l) => l());
  }
});

// apply once on module load so there is no unstyled flash
if (typeof document !== 'undefined') applyTheme();
