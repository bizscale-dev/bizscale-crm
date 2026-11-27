'use client';

import { useState } from 'react';
import { sendSupportQuery } from '@/lib/supportActions';
import { QueryCard, ClientSelect, ErrorText, useAction, useAutoRefresh, cardStyle, inputStyle, labelStyle, primaryBtn, mutedStyle } from './shared';

// The managers' Support page: send a query (it goes to the admin first) and read the replies.
export default function ManagerSupport({ queries, clients }) {
  useAutoRefresh();
  const [clientName, setClientName] = useState('');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useAction();

  const submit = (e) => {
    e.preventDefault();
    setSent(false);
    run(() => sendSupportQuery(text, clientName), () => { setClientName(''); setText(''); setSent(true); });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '900px' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>Support</h1>
        <p style={{ ...mutedStyle, fontSize: '0.875rem', margin: 0 }}>Send a query to Support. The admin approves it and chooses who receives it; their replies appear here.</p>
      </div>

      <form onSubmit={submit} style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <ClientSelect id="support-query-client" clients={clients} value={clientName} onChange={setClientName} />
        <div>
          <label style={labelStyle} htmlFor="support-query">Your query</label>
          <textarea id="support-query" value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="What do you need from Support?" style={{ ...inputStyle, resize: 'vertical' }} required />
        </div>
        <ErrorText error={error} />
        {sent && <div style={{ color: 'var(--success)', fontSize: '0.85rem' }}>Sent to the admin for approval.</div>}
        <div><button type="submit" disabled={busy || !text.trim()} style={{ ...primaryBtn, opacity: busy || !text.trim() ? 0.6 : 1 }}>{busy ? 'Sending…' : 'Send query'}</button></div>
      </form>

      <h2 style={{ fontSize: '1.1rem', margin: 0 }}>Your queries ({queries.length})</h2>
      {queries.length === 0 ? (
        <div style={cardStyle}><p style={{ margin: 0, color: 'var(--text-muted)' }}>You have not sent any query yet.</p></div>
      ) : queries.map((q) => (
        <QueryCard key={q.id} query={q}>
          {q.replies.some((r) => r.isNew) && <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--success)', marginTop: '0.5rem' }}>● New reply</div>}
        </QueryCard>
      ))}
    </div>
  );
}
