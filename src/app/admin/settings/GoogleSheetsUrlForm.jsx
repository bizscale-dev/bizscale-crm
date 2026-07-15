'use client';

import { useActionState } from 'react';
import { updateGoogleSheetsUrl } from './actions';

export default function GoogleSheetsUrlForm({ currentUrl }) {
  const [state, formAction, isPending] = useActionState(updateGoogleSheetsUrl, { error: null, success: null });

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

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
          Google Sheets URL
        </label>
        <input 
          type="url" 
          name="sheet_url" 
          defaultValue={currentUrl}
          placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
          required
          style={{
            width: '100%',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            boxSizing: 'border-box'
          }}
        />
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Make sure the "Active Clients" tab exists in your sheet with:
          <br />• Column C: Client names
          <br />• Column H: Associate names
        </p>
      </div>

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save Google Sheets URL'}
      </button>
    </form>
  );
}
