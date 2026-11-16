'use client';

import { useState } from 'react';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const linkBtn = { marginTop: '0.3rem', fontSize: '0.75rem', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 };
const imgStyle = { display: 'block', maxWidth: '100%', maxHeight: '200px', borderRadius: '0.5rem', border: '1px solid var(--border)' };

// Optional picture for a report: choose a file or paste a screenshot (Ctrl+V). `value` is a data URL or null.
// `existing` is the URL of a picture already saved (edit mode), shown until it is replaced or removed.
export default function ImagePicker({ value, onChange, existing = null, onRemoveExisting }) {
  const [error, setError] = useState(null);
  const [key, setKey] = useState(0);

  const load = (file) => {
    if (!file) { onChange(null); return; }
    if (file.size > MAX_IMAGE_BYTES) { setError('The picture is too large — max 2MB.'); onChange(null); setKey((k) => k + 1); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    setKey((k) => k + 1);
    load(item.getAsFile());
  };

  return (
    <div onPaste={onPaste}>
      <input key={key} type="file" accept="image/*" onChange={(e) => load(e.target.files?.[0])} style={{ fontSize: '0.8rem' }} />
      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>or paste a screenshot (Ctrl+V)</span>
      {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{error}</div>}
      {value && (
        <div style={{ marginTop: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Preview" style={imgStyle} />
          <button type="button" onClick={() => { onChange(null); setKey((k) => k + 1); }} style={linkBtn}>Remove picture</button>
        </div>
      )}
      {!value && existing && (
        <div style={{ marginTop: '0.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={existing} alt="Current" style={imgStyle} />
          <button type="button" onClick={onRemoveExisting} style={linkBtn}>Remove picture</button>
        </div>
      )}
    </div>
  );
}
