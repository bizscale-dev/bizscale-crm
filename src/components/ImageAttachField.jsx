'use client';

import { useEffect, useState } from 'react';

const MAX_BYTES = 2 * 1024 * 1024;

// Optional picture for a task / report: choose a file OR press Ctrl+V to paste a screenshot straight from the
// clipboard. `value` is the picture as a data URL (null = none). Paste is listened for while the field is on
// screen and only takes over when the clipboard really holds an image — text pastes are left alone.
export default function ImageAttachField({ value, onChange, label = 'Image (optional)' }) {
  const [error, setError] = useState(null);

  const load = (file) => {
    if (!file) return;
    if (file.size > MAX_BYTES) { setError('Image is too large — max 2MB.'); return; }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      if (file.size > MAX_BYTES) { setError('Image is too large — max 2MB.'); return; }
      setError(null);
      const reader = new FileReader();
      reader.onload = () => onChange(reader.result);
      reader.readAsDataURL(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onChange]);

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</label>
      {value ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Attachment preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'block' }} />
          <button type="button" onClick={() => onChange(null)} style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}>Remove image</button>
        </div>
      ) : (
        <div>
          <input type="file" accept="image/*" onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>or press <strong>Ctrl+V</strong> to paste a screenshot</div>
        </div>
      )}
      {error && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.35rem' }}>{error}</div>}
    </div>
  );
}
