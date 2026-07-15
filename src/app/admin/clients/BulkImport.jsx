'use client';

import { useActionState } from 'react';
import { bulkCreateClients } from './actions';

export default function BulkImport() {
  const [state, formAction, isPending] = useActionState(bulkCreateClients, { error: null, success: null });

  return (
    <form action={formAction}>
      {state?.error && (
        <div style={{ color: 'var(--danger)', marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--danger)', borderRadius: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div style={{ color: 'var(--success)', marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--success)', borderRadius: '0.5rem', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
          {state.success}
        </div>
      )}

      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Paste client data from Excel or Google Sheets. Format: <code>Name [Tab] Website</code> per line.
      </p>

      <div style={{ marginBottom: '1.5rem' }}>
        <textarea 
          name="bulk_data" 
          placeholder="Client Name&#9;https://example.com&#10;Another Client&#9;https://another.com" 
          required 
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', minHeight: '150px', resize: 'vertical' }}
        ></textarea>
      </div>

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Importing...' : 'Import Clients'}
      </button>
    </form>
  );
}
