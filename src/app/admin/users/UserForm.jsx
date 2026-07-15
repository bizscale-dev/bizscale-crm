'use client';

import { useActionState } from 'react';
import { createUser, updateUser } from './actions';

export default function UserForm({ mode = 'create', initialData = null, onSuccess }) {
  const [state, formAction, isPending] = useActionState(
    mode === 'create' ? createUser : updateUser, 
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Name</label>
          <input type="text" name="name" defaultValue={initialData?.name || ''} required style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
          <input type="email" name="email" defaultValue={initialData?.email || ''} required style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Role</label>
          <select name="role" defaultValue={initialData?.role || 'seo_associate'} style={inputStyle}>
            <option value="admin">Admin</option>
            <option value="manager">Manager</option>
            <option value="seo_associate">SEO Associate</option>
            <option value="web_seo_associate">Web SEO Associate</option>
            <option value="writer">Writer</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            {mode === 'create' ? 'Password' : 'New Password (leave blank to keep current)'}
          </label>
          <input type="password" name={mode === 'create' ? 'password' : 'new_password'} required={mode === 'create'} minLength="6" style={inputStyle} />
        </div>
      </div>

      {mode === 'edit' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" name="is_active" defaultChecked={initialData?.is_active === 1} />
            Active Account
          </label>
        </div>
      )}

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Saving...' : mode === 'create' ? 'Create User' : 'Save Changes'}
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
