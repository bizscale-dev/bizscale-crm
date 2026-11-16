'use client';

import { useSyncExternalStore } from 'react';

// Header switch between the dark and light theme. The choice is saved in this browser (localStorage); with nothing
// saved the page follows the device setting, as before.
const listeners = new Set();
const subscribe = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };

function currentTheme() {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function ThemeToggle() {
  // null on the server / first render so the markup matches, then the real theme
  const theme = useSyncExternalStore(subscribe, currentTheme, () => null);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    listeners.forEach((cb) => cb());
  };

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      disabled={theme === null}
      style={{
        width: '36px', height: '36px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '0.6rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)',
        color: 'var(--foreground)', cursor: 'pointer', fontSize: '1.05rem', lineHeight: 1, padding: 0,
      }}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
