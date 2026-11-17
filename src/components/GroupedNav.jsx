'use client';

import Link from 'next/link';
import { useState } from 'react';

// Small stroke icons (24x24), keyed by name, so the menu needs no icon library.
const ICONS = {
  chart: <><line x1="6" y1="20" x2="6" y2="11" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.2 4.5 2.4 4.5 5.3" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  doc: <><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4" /><line x1="10" y1="12" x2="16" y2="12" /><line x1="10" y1="16" x2="16" y2="16" /></>,
  clipboard: <><rect x="6" y="5" width="12" height="16" rx="2" /><path d="M9 5V3.5h6V5" /><path d="m9.5 13 2 2 3.5-4" /></>,
  monitor: <><rect x="3" y="4" width="18" height="12" rx="2" /><line x1="8" y1="20" x2="16" y2="20" /><line x1="12" y1="16" x2="12" y2="20" /></>,
  plus: <><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>,
  star: <><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></>,
  shield: <><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><line x1="4" y1="10" x2="20" y2="10" /><line x1="9" y1="3" x2="9" y2="7" /><line x1="15" y1="3" x2="15" y2="7" /></>,
};

export function NavIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {ICONS[name] || ICONS.grid}
    </svg>
  );
}

const ACTIVE_BG = 'var(--primary)';
const MUTED = 'var(--text-muted)';

// Sidebar menu split into collapsible groups, each with a header icon and small icons per item.
// groups: [{ label, icon, items: [{ href, label, icon, badgeCount }] }]
export default function GroupedNav({ groups, isActive, sidebarOpen }) {
  const [closed, setClosed] = useState({});
  const toggle = (label) => setClosed((c) => ({ ...c, [label]: !c[label] }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: sidebarOpen ? '0 0.75rem' : '0 0.5rem' }}>
      {groups.map((g) => {
        const open = !closed[g.label];
        const hasBadge = g.items.some((i) => i.badgeCount);
        return (
          <div key={g.label}>
            {sidebarOpen ? (
              <button
                type="button"
                onClick={() => toggle(g.label)}
                aria-expanded={open}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.7rem 0.6rem', background: 'none', border: 'none', color: 'var(--foreground)', fontWeight: '700', fontSize: '0.88rem', cursor: 'pointer', textAlign: 'left' }}
              >
                <NavIcon name={g.icon} />
                <span style={{ flex: 1 }}>{g.label}</span>
                {!open && hasBadge && <span className="nav-badge-breathing" style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#22c55e' }} />}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', opacity: 0.8 }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            ) : (
              <div style={{ height: '1px', backgroundColor: 'var(--border)', margin: '0.6rem 0.4rem' }} />
            )}

            {(open || !sidebarOpen) && (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {g.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href} style={{ position: 'relative' }}>
                      <Link
                        href={item.href}
                        title={!sidebarOpen ? item.label : undefined}
                        className={active ? undefined : 'grouped-nav-link'}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: sidebarOpen ? 'flex-start' : 'center',
                          gap: '0.7rem',
                          padding: sidebarOpen ? '0.6rem 0.75rem 0.6rem 2.1rem' : '0.65rem 0',
                          borderRadius: '0.5rem',
                          backgroundColor: active ? ACTIVE_BG : 'transparent',
                          color: active ? '#fff' : MUTED,
                          fontWeight: active ? '600' : '500',
                          fontSize: '0.86rem',
                          textDecoration: 'none',
                          position: 'relative',
                        }}
                      >
                        <NavIcon name={item.icon} size={sidebarOpen ? 16 : 19} />
                        {sidebarOpen && <span>{item.label}</span>}
                        {!!item.badgeCount && (
                          <span className="nav-badge-breathing" style={{
                            position: sidebarOpen ? 'static' : 'absolute',
                            marginLeft: sidebarOpen ? 'auto' : 0,
                            top: '0.3rem',
                            right: '0.35rem',
                            width: '11px',
                            height: '11px',
                            borderRadius: '50%',
                            backgroundColor: '#22c55e',
                            border: '2px solid var(--card-bg)',
                            boxShadow: '0 0 0 0 rgba(34, 197, 94, 0.7)',
                          }} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <style>{`
        .grouped-nav-link:hover { background-color: rgba(22, 178, 147, 0.1) !important; color: var(--primary) !important; }
      `}</style>
    </div>
  );
}
