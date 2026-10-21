'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addReportComment } from '@/app/qa-reports/actions';

// The discussion on a QA report: comments from QA and the manager, with the
// workflow events (fix submitted / rejected / confirmed) in the same timeline.
// canComment is false for admin (read-only). Used by QA and manager pages.
const KINDS = {
  comment: { label: null, color: 'var(--text-muted)', border: 'var(--border)' },
  fix: { label: 'Fix submitted', color: '#3b82f6', border: 'rgba(59, 130, 246, 0.4)' },
  rejected: { label: 'Rejected by QA', color: 'var(--danger)', border: 'rgba(239, 68, 68, 0.5)' },
  confirmed: { label: 'Confirmed by QA', color: 'var(--success)', border: 'rgba(34, 197, 94, 0.5)' },
};

const when = (s) => new Date(s.replace(' ', 'T') + 'Z').toLocaleString();

export default function ReportThread({ reportId, comments = [], canComment = true }) {
  const router = useRouter();
  const [open, setOpen] = useState(comments.length > 0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await addReportComment(reportId, text);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    setText('');
    router.refresh();
  };

  return (
    <div style={{ marginTop: '0.9rem' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: '0.8rem', fontWeight: '600' }}
      >
        {open ? 'Hide comments' : `Comments (${comments.length})`}
      </button>

      {open && (
        <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {comments.length === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No comments yet.</div>}
          {comments.map((c) => {
            const k = KINDS[c.kind] || KINDS.comment;
            return (
              <div key={c.id} style={{ padding: '0.6rem 0.85rem', backgroundColor: 'var(--background)', border: `1px solid ${k.border}`, borderRadius: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  <span>
                    <strong style={{ color: 'var(--foreground)' }}>{c.author}</strong>
                    {c.author_role === 'qa' ? ' · QA' : ' · Manager'}
                    {k.label && <strong style={{ color: k.color }}> · {k.label}</strong>}
                  </span>
                  <span>{when(c.created_at)}</span>
                </div>
                <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
              </div>
            );
          })}

          {canComment && (
            <div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Add a comment…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical' }}
              />
              {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{error}</div>}
              <button
                type="button"
                onClick={send}
                disabled={busy || !text.trim()}
                style={{ marginTop: '0.4rem', padding: '0.4rem 1rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', opacity: busy || !text.trim() ? 0.6 : 1 }}
              >
                {busy ? 'Sending…' : 'Add comment'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
