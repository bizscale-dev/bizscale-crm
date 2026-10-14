'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUndismissedDialogNotifications, markNotificationsDialogShown } from '@/app/notifications/actions';

const BRAND_COLOR = 'var(--primary)';
const RECHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

// Shown once per batch of "new since last check" task assignments — on the
// initial portal load (login or a plain refresh), and then re-checked every
// 10 minutes after that so an assignment made while someone is already
// sitting on the page still surfaces the popup, not just a bell update,
// without needing them to reload the page themselves. Dismissed (closed or
// "View Tasks" clicked) marks every fetched row's dialog_shown_at so it
// won't reopen for the same batch; a genuinely new assignment arriving
// later still opens it again on the next check.
export default function NotificationLoginDialog() {
  const router = useRouter();
  const [pending, setPending] = useState([]);
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      // Don't fetch/replace while the dialog is already up for an earlier
      // batch — let the user act on what they're looking at first.
      if (pendingRef.current.length > 0) return;
      const rows = await getUndismissedDialogNotifications();
      if (!cancelled && rows.length > 0) setPending(rows);
    };
    check();
    const interval = setInterval(check, RECHECK_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (pending.length === 0) return null;

  const dismiss = async () => {
    const ids = pending.map((n) => n.id);
    setPending([]);
    await markNotificationsDialogShown(ids);
  };

  const handleView = async () => {
    const link = pending[0].link;
    await dismiss();
    router.push(link);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        padding: '2rem',
        maxWidth: '380px',
        width: '90%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔔</div>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>
          You have {pending.length} new task{pending.length === 1 ? '' : 's'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
          Please view your tasks.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={dismiss}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleView}
            style={{
              padding: '0.6rem 1.25rem',
              backgroundColor: BRAND_COLOR,
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.875rem',
            }}
          >
            View Tasks
          </button>
        </div>
      </div>
    </div>
  );
}
