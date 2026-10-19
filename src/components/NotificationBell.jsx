'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getNotifications, getUnreadNotificationCount, markNotificationRead, markAllNotificationsRead,
} from '@/app/notifications/actions';

const BRAND_COLOR = 'var(--primary)';

// One shared AudioContext per page, created lazily on the user's first
// interaction anywhere — browsers refuse to let audio play until a user
// gesture has happened on the page at least once, so there is no audio
// file to pre-load, just a synthesized tone. Rather than trusting a
// manually tracked "unlocked" flag (which can drift out of sync with the
// browser's actual state), every play attempt re-checks/re-resumes the
// real AudioContext state directly.
let sharedAudioContext = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

if (typeof document !== 'undefined') {
  // Not { once: true } — keeps nudging resume() on every interaction so an
  // earlier gesture that happened before the context existed, or a context
  // that got suspended again (some browsers do this on tab backgrounding),
  // still gets unlocked on the next click/tap/keypress.
  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  ['click', 'pointerdown', 'keydown', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, unlock, { passive: true })
  );
}

function playNotificationTone() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    // Will only actually resume if a user gesture has occurred somewhere on
    // this page — if none has, this (and the tone below) silently no-ops,
    // which is the one unavoidable browser restriction here.
    ctx.resume().catch(() => {});
  }
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.12);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}

function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

// Native OS toast (the Windows/macOS banner Chrome shows for e.g. Google
// Chat) — works while the tab is open but in the background or minimized.
// When the tab is visible we mute the toast's own sound and play our
// synthesized tone instead (one ding, not two); when it's hidden the OS
// plays its notification sound, since a backgrounded tab's Web Audio is
// unreliable. Returns whether a toast was actually shown.
function showDesktopNotification(n, onClick) {
  if (getNotificationPermission() !== 'granted') return false;
  try {
    const toast = new Notification(n.title, {
      body: n.message,
      icon: '/logo.png',
      tag: `bizscale-notification-${n.id}`,
      silent: document.visibilityState === 'visible',
    });
    toast.onclick = () => {
      window.focus();
      toast.close();
      onClick(n);
    };
    return true;
  } catch {
    return false;
  }
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z').getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [permission, setPermission] = useState(getNotificationPermission);
  const prevUnreadRef = useRef(0);
  const firstPollRef = useRef(true);
  const lastSeenIdRef = useRef(0);

  // Browsers only allow the permission prompt in response to a user
  // gesture, so ask on the first click anywhere in the app (same unlock
  // pattern as the audio context) rather than on page load.
  useEffect(() => {
    if (getNotificationPermission() !== 'default') return;
    const ask = () => {
      Notification.requestPermission()
        .then((result) => setPermission(result))
        .catch(() => {});
    };
    document.addEventListener('click', ask, { once: true });
    return () => document.removeEventListener('click', ask);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const openFromToast = async (n) => {
      await markNotificationRead(n.id);
      setUnreadCount((c) => Math.max(0, c - 1));
      router.push(n.link);
    };

    const poll = async () => {
      const count = await getUnreadNotificationCount();
      if (cancelled) return;

      if (firstPollRef.current) {
        // Remember the newest existing notification so only genuinely new
        // ones (arriving after this page loaded) ever trigger a toast.
        const rows = await getNotifications();
        if (cancelled) return;
        lastSeenIdRef.current = rows.reduce((max, r) => Math.max(max, r.id), 0);
      } else if (count > prevUnreadRef.current) {
        // Unread count went UP since the last poll — fetch what's new and
        // show a native desktop toast for each (cap 3 so a burst doesn't
        // flood the screen); fall back to just our in-page tone if the
        // user hasn't granted desktop-notification permission.
        const rows = await getNotifications();
        if (cancelled) return;
        const fresh = rows
          .filter((r) => !r.read_at && r.id > lastSeenIdRef.current)
          .sort((a, b) => a.id - b.id);
        lastSeenIdRef.current = rows.reduce((max, r) => Math.max(max, r.id), lastSeenIdRef.current);

        let toastShown = false;
        for (const r of fresh.slice(-3)) {
          if (showDesktopNotification(r, openFromToast)) toastShown = true;
        }
        if (!toastShown || document.visibilityState === 'visible') playNotificationTone();
      }

      firstPollRef.current = false;
      prevUnreadRef.current = count;
      setUnreadCount(count);
    };
    poll();
    const interval = setInterval(poll, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [router]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const rows = await getNotifications();
      setNotifications(rows);
    }
  };

  const handleItemClick = async (n) => {
    await markNotificationRead(n.id);
    setOpen(false);
    setUnreadCount((c) => Math.max(0, c - (n.read_at ? 0 : 1)));
    router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="Notifications"
        style={{
          position: 'relative',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.5rem',
          color: 'var(--foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '16px',
            height: '16px',
            padding: '0 3px',
            borderRadius: '8px',
            backgroundColor: '#ef4444',
            color: 'white',
            fontSize: '0.65rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 0.5rem)',
            width: '340px',
            maxHeight: '420px',
            overflowY: 'auto',
            backgroundColor: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: '0.6rem',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            zIndex: 50,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)' }}>
              <strong style={{ fontSize: '0.875rem' }}>Notifications</strong>
              {unreadCount > 0 && (
                <button type="button" onClick={handleMarkAllRead} style={{ background: 'none', border: 'none', color: BRAND_COLOR, fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}>
                  Mark all read
                </button>
              )}
            </div>
            {permission === 'default' && (
              <button
                type="button"
                onClick={() => Notification.requestPermission().then(setPermission).catch(() => {})}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '0.6rem 1rem', border: 'none', borderBottom: '1px solid var(--border)', background: 'rgba(22, 178, 147, 0.08)', color: BRAND_COLOR, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
              >
                🔔 Turn on desktop alerts — get a popup + sound even when this tab is in the background
              </button>
            )}
            {permission === 'denied' && (
              <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Desktop alerts are blocked — allow notifications for this site in your browser&apos;s site settings to get popups.
              </div>
            )}
            {notifications.length === 0 ? (
              <p style={{ padding: '1.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
                No notifications yet.
              </p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: n.read_at ? 'transparent' : 'rgba(22, 178, 147, 0.06)',
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', fontWeight: n.read_at ? '500' : '700' }}>{n.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{n.message}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>{timeAgo(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
