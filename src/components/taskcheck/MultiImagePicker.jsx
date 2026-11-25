'use client';

import { useRef, useState } from 'react';

export const MAX_IMAGES = 6;
const MAX_SIDE = 1600;

// Reads an image file and shrinks it (longest side 1600px, JPEG) so several pictures together stay well
// under the server's request limit. Small images that are already light are kept as they are.
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const original = reader.result;
      const img = new Image();
      img.onerror = () => reject(new Error('decode'));
      img.onload = () => {
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        if (scale === 1 && file.size <= 400 * 1024) return resolve(original);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}

// Several pictures: pick files (many at once), or paste screenshots (Ctrl+V). `value` is an array of data URLs.
export default function MultiImagePicker({ value, onChange, max = MAX_IMAGES, label = 'Add pictures' }) {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const add = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;
    setError(null);
    const room = max - value.length;
    if (room <= 0) { setError(`At most ${max} pictures.`); return; }
    setBusy(true);
    try {
      const loaded = [];
      for (const f of list.slice(0, room)) loaded.push(await loadImage(f));
      onChange([...value, ...loaded]);
      if (list.length > room) setError(`Only ${max} pictures fit — the rest were skipped.`);
    } catch {
      setError('One of the pictures could not be read — try another file.');
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean);
    if (files.length === 0) return;
    e.preventDefault();
    add(files);
  };

  return (
    <div onPaste={onPaste}>
      <input ref={inputRef} type="file" accept="image/*" multiple onChange={(e) => add(e.target.files || [])} style={{ fontSize: '0.8rem' }} aria-label={label} />
      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
        pick one or more, or paste (Ctrl+V) · {value.length}/{max}{busy ? ' · adding…' : ''}
      </span>
      {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.3rem' }}>{error}</div>}
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          {value.map((src, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={`Picture ${i + 1}`} style={{ display: 'block', height: '110px', maxWidth: '200px', objectFit: 'cover', borderRadius: '0.5rem', border: '1px solid var(--border)' }} />
              <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={`Remove picture ${i + 1}`}
                style={{ position: 'absolute', top: '4px', right: '4px', width: '22px', height: '22px', borderRadius: '50%', border: 'none', cursor: 'pointer', backgroundColor: 'rgba(0,0,0,0.65)', color: 'white', fontSize: '0.8rem', lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
