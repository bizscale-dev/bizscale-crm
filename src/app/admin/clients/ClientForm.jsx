'use client';

import { useActionState } from 'react';
import { createClient, updateClient } from './actions';

export default function ClientForm({ mode = 'create', initialData = null, onSuccess }) {
  const [state, formAction, isPending] = useActionState(
    mode === 'create' ? createClient : updateClient, 
    { error: null, success: null }
  );

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

      {mode === 'edit' && <input type="hidden" name="id" value={initialData?.id} />}

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Client Name</label>
        <input type="text" name="name" defaultValue={initialData?.name || ''} required style={inputStyle} />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Website</label>
        <input type="url" name="website" defaultValue={initialData?.website || ''} style={inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Niche</label>
          <input type="text" name="niche" defaultValue={initialData?.niche || ''} style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Sort Order</label>
          <input type="number" name="sort_order" defaultValue={initialData?.sort_order || ''} style={inputStyle} placeholder="Auto-assigned if left blank" />
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Notes</label>
        <textarea name="notes" defaultValue={initialData?.notes || ''} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}></textarea>
      </div>

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Saving...' : mode === 'create' ? 'Add Client' : 'Save Changes'}
      </button>
      
      {mode === 'edit' && (
        <button type="button" onClick={onSuccess} className="btn" style={{ marginLeft: '1rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
          Cancel
        </button>
      )}
    </form>
  );
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};
