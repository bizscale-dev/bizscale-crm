'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportBug } from '@/lib/taskCheckActions';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const label = { display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' };
const input = { width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' };

// An Executive highlights a bug by hand on one of their team: description (required), picture and link (optional).
export default function BugReportForm({ people, targetLabel }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState(people.length === 1 ? String(people[0].id) : '');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const loadImage = (file) => {
    if (!file) return setImage(null);
    if (file.size > MAX_IMAGE_BYTES) { setMessage({ error: true, text: 'The picture is too large — max 2MB.' }); setImage(null); return false; }
    setMessage(null);
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
    return true;
  };

  // Ctrl+V of a screenshot anywhere in the form.
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    setFileKey((k) => k + 1);
    loadImage(item.getAsFile());
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await reportBug({ userId, description, link, image });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    setMessage({ text: `Reported — ${res.name} has been notified.` });
    setDescription(''); setLink(''); setImage(null); setFileKey((k) => k + 1);
    router.refresh();
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1rem 1.25rem', backgroundColor: 'var(--card-bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Report a bug</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Highlight a problem by hand on the {targetLabel} — add a description, and a picture and link if you have them.</div>
        </div>
        <button type="button" onClick={() => setOpen(!open)} style={{ padding: '0.4rem 1rem', borderRadius: '0.5rem', border: '1px solid var(--primary)', backgroundColor: open ? 'var(--primary)' : 'transparent', color: open ? 'white' : 'var(--primary)', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}>
          {open ? 'Close' : '+ Report a bug'}
        </button>
      </div>
      {message && !open && <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', color: message.error ? 'var(--danger)' : 'var(--success)' }}>{message.text}</div>}

      {open && (
        <form onSubmit={submit} onPaste={onPaste} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <div>
            <label style={label}>{targetLabel}</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={input}>
              <option value="">Select…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...input, resize: 'vertical' }} placeholder="What is wrong, and where…" />
          </div>
          <div>
            <label style={label}>Link (optional)</label>
            <input type="text" value={link} onChange={(e) => setLink(e.target.value)} style={input} placeholder="https://…" />
          </div>
          <div>
            <label style={label}>Picture (optional) — choose a file or paste a screenshot</label>
            <input key={fileKey} type="file" accept="image/*" onChange={(e) => { if (loadImage(e.target.files?.[0]) === false) e.target.value = ''; }} />
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="Preview" style={{ display: 'block', maxWidth: '100%', maxHeight: '200px', marginTop: '0.5rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
            )}
          </div>
          {message && <div style={{ fontSize: '0.8rem', color: message.error ? 'var(--danger)' : 'var(--success)' }}>{message.text}</div>}
          <div>
            <button type="submit" disabled={busy} style={{ padding: '0.5rem 1.2rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy ? 'Sending…' : 'Send report'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
