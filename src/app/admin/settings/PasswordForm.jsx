'use client';

import { useActionState } from 'react';
import { updatePassword } from './actions';

export default function PasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePassword, { error: null, success: null });

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {state?.error && (
        <div style={{ color: 'var(--danger)', padding: '0.75rem', border: '1px solid var(--danger)', borderRadius: '0.5rem', backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
          {state.error}
        </div>
      )}
      {state?.success && (
        <div style={{ color: 'var(--success)', padding: '0.75rem', border: '1px solid var(--success)', borderRadius: '0.5rem', backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
          {state.success}
        </div>
      )}

      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Current Password</label>
        <input type="password" name="current_password" required style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>New Password</label>
        <input type="password" name="new_password" required minLength="6" style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', marginBottom: '0.5rem' }}>Confirm New Password</label>
        <input type="password" name="confirm_password" required minLength="6" style={inputStyle} />
      </div>

      <div>
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? 'Updating...' : 'Update Password'}
        </button>
      </div>
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
