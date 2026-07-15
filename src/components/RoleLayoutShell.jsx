'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { logout } from '@/app/login/actions';
import Logo from '@/components/Logo';

const BRAND_COLOR = 'var(--primary)';

export default function RoleLayoutShell({ navItems, portalLabel, headerTitle, headerExtra, children }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // The first nav item is always the role's dashboard root (e.g. "/writer") and needs
  // an exact match, or it would also light up for every nested route under it.
  const rootHref = navItems[0]?.href;
  const isActive = (href) => {
    if (href === rootHref) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--background)' }}>
      <aside style={{
        width: sidebarOpen ? '260px' : '80px',
        backgroundColor: 'var(--card-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.3s ease',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.5rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          minHeight: '80px'
        }}>
          {sidebarOpen ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <Logo width={32} height={32} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: BRAND_COLOR, margin: 0, whiteSpace: 'nowrap' }}>BizScale</h2>
              </div>

              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: BRAND_COLOR,
                  transition: 'all 0.2s',
                  marginLeft: '1rem'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'rgba(22, 178, 147, 0.1)';
                  e.target.style.borderRadius = '0.5rem';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                opacity: 0.8,
                width: '100%'
              }}
              onMouseEnter={(e) => {
                e.target.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.target.style.opacity = '0.8';
              }}
            >
              <Logo width={28} height={28} />
            </button>
          )}
        </div>

        {sidebarOpen && portalLabel && (
          <span style={{
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            paddingLeft: '2.75rem',
            paddingBottom: '0.5rem'
          }}>
            {portalLabel}
          </span>
        )}

        <nav style={{ flex: 1, padding: '1rem 0', position: 'relative' }}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href} style={{ position: 'relative' }}>
                  <Link
                    href={item.href}
                    title={!sidebarOpen ? item.label : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: sidebarOpen ? 'flex-start' : 'center',
                      padding: '0.75rem 1.5rem',
                      color: active ? BRAND_COLOR : 'var(--text-muted)',
                      textDecoration: 'none',
                      fontWeight: active ? '600' : '500',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      minHeight: '48px'
                    }}
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.target.style.color = BRAND_COLOR;
                        e.target.style.fontWeight = '600';
                        if (sidebarOpen) {
                          e.target.style.paddingLeft = '1.75rem';
                        }
                        e.target.style.backgroundColor = 'rgba(22, 178, 147, 0.08)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.target.style.color = 'var(--text-muted)';
                        e.target.style.fontWeight = '500';
                        if (sidebarOpen) {
                          e.target.style.paddingLeft = '1.5rem';
                        }
                        e.target.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    {sidebarOpen ? item.label : (
                      <span style={{ fontSize: '0.875rem' }}>
                        {item.label.charAt(0).toUpperCase()}
                      </span>
                    )}

                    {active && (
                      <div style={{
                        position: 'absolute',
                        right: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '4px',
                        height: '24px',
                        backgroundColor: BRAND_COLOR,
                        borderRadius: '4px 0 0 4px',
                        animation: 'slideIn 0.3s ease'
                      }} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <style>{`
            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateY(-50%) scaleY(0);
              }
              to {
                opacity: 1;
                transform: translateY(-50%) scaleY(1);
              }
            }
          `}</style>
        </nav>

        <div style={{ padding: '1rem', borderTop: '1px solid var(--border)' }}>
          <form action={logout}>
            <button type="submit" className="btn" style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: `1px solid ${BRAND_COLOR}`,
              color: BRAND_COLOR,
              fontWeight: '500',
              transition: 'all 0.2s',
              cursor: 'pointer',
              padding: sidebarOpen ? '0.5rem' : '0.35rem',
              fontSize: sidebarOpen ? '1rem' : '0.75rem'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = BRAND_COLOR;
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = BRAND_COLOR;
            }}>
              {sidebarOpen ? 'Logout' : 'Log'}
            </button>
          </form>
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto' }}>
        <header style={{
          padding: '1rem 2rem',
          backgroundColor: 'var(--card-bg)',
          borderBottom: `2px solid ${BRAND_COLOR}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '1.25rem', margin: 0, color: BRAND_COLOR, fontWeight: 'bold' }}>{headerTitle}</h1>
          {headerExtra !== undefined ? headerExtra : (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </header>
        <div style={{ padding: '2rem', flex: 1 }}>
          {children}
        </div>
      </main>
    </div>
  );
}
