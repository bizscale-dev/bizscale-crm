'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteQaReport } from './actions';

export default function DeleteReportButton({ reportId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    if (!window.confirm('Delete this report? It will also disappear from the manager\'s Reports page. This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    const res = await deleteQaReport(reportId);
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  };

  return (
    <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        style={{ padding: '0.35rem 0.9rem', backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Deleting...' : 'Delete report'}
      </button>
      {error && <span style={{ fontSize: '0.78rem', color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
