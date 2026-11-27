'use client';

import { useState } from 'react';
import { replyToSupportQuery } from '@/lib/supportActions';
import { QueryCard, Tabs, ErrorText, useAction, useAutoRefresh, cardStyle, inputStyle, primaryBtn, mutedStyle } from './shared';

function ReplyBox({ queryId }) {
  const [text, setText] = useState('');
  const { busy, error, run } = useAction();
  return (
    <form
      style={{ marginTop: '0.8rem' }}
      onSubmit={(e) => { e.preventDefault(); run(() => replyToSupportQuery(queryId, text), () => setText('')); }}
    >
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a reply — it goes straight to the manager" aria-label="Reply" style={{ ...inputStyle, resize: 'vertical' }} />
      <ErrorText error={error} />
      <button type="submit" disabled={busy || !text.trim()} style={{ ...primaryBtn, marginTop: '0.5rem', opacity: busy || !text.trim() ? 0.6 : 1 }}>
        {busy ? 'Sending…' : 'Send reply'}
      </button>
    </form>
  );
}

// Support portal: the queries the admin sent to this person.
export default function SupportQueries({ queries }) {
  useAutoRefresh();
  const waiting = queries.filter((q) => q.replies.length === 0);
  const [tab, setTab] = useState('all');
  const visible = tab === 'waiting' ? waiting : queries;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '900px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Queries</h1>
        <p style={{ ...mutedStyle, fontSize: '0.875rem', margin: 0 }}>Queries from managers that the admin sent to you. Your reply is delivered to the manager.</p>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'All', count: queries.length }, { value: 'waiting', label: 'No reply yet', count: waiting.length }]} />
      {visible.length === 0 ? (
        <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>No queries here.</p></div>
      ) : visible.map((q) => (
        <QueryCard key={q.id} query={q} showFrom>
          <ReplyBox queryId={q.id} />
        </QueryCard>
      ))}
    </div>
  );
}
