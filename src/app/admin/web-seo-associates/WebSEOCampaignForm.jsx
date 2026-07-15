'use client';

import { useActionState, useState, useMemo } from 'react';
import { createCampaign, updateCampaign } from '../campaign/actions';

export default function WebSEOCampaignForm({ mode = 'create', initialData = null, onSuccess }) {
  const [state, formAction, isPending] = useActionState(
    mode === 'create' ? createCampaign : updateCampaign, 
    { error: null, success: null }
  );

  const [webseoTargets, setWebseoTargets] = useState(() => {
    if (initialData) {
      return {
        guestpost: initialData.webseo_guestpost_target || 7,
        web2: initialData.webseo_web2_target || 7
      };
    }
    return {
      guestpost: 7,
      web2: 7
    };
  });

  // Calculate total Web SEO posts per client
  const totalWebSEOPostsPerClient = useMemo(() => {
    return webseoTargets.guestpost + webseoTargets.web2;
  }, [webseoTargets]);

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
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Campaign Name</label>
          <input type="text" name="name" defaultValue={initialData?.name || ''} required style={inputStyle} placeholder="e.g. Web SEO Q1 2025" />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Start Date</label>
          <input type="date" name="start_date" defaultValue={initialData?.start_date || new Date().toISOString().split('T')[0]} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Total Days</label>
          <input type="number" name="total_days" defaultValue={initialData?.total_days || 16} min="1" style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Clients Per Day</label>
          <input type="number" name="clients_per_day" defaultValue={initialData?.clients_per_day || 4} min="1" style={inputStyle} />
        </div>
        {mode === 'edit' && (
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Status</label>
            <select name="status" defaultValue={initialData?.status || 'active'} style={inputStyle}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        )}
      </div>

      <h4 style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>Web SEO Associates Settings</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.05)', borderRadius: '0.5rem', border: '1px solid rgba(22, 178, 147, 0.2)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Guest Post Target per Client</label>
          <input 
            type="number" 
            name="webseo_guestpost_target" 
            value={webseoTargets.guestpost}
            onChange={(e) => setWebseoTargets({ ...webseoTargets, guestpost: parseInt(e.target.value) || 0 })}
            min="0" 
            style={inputStyle} 
          />
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Number of guest posts per client for Web SEO Associates
          </p>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>Web 2.0 Post Target per Client</label>
          <input 
            type="number" 
            name="webseo_web2_target" 
            value={webseoTargets.web2}
            onChange={(e) => setWebseoTargets({ ...webseoTargets, web2: parseInt(e.target.value) || 0 })}
            min="0" 
            style={inputStyle} 
          />
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Number of web 2.0 posts per client for Web SEO Associates
          </p>
        </div>
      </div>

      <div style={{ padding: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', borderRadius: '0.5rem', marginBottom: '2rem' }}>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          <strong>Total Web SEO Posts per Client:</strong> {totalWebSEOPostsPerClient} posts (Guest Posts: {webseoTargets.guestpost} + Web 2.0: {webseoTargets.web2})
        </p>
      </div>

      {/* Hidden fields for regular campaign settings that Web SEO uses */}
      <input type="hidden" name="links_per_client" value="50" />
      <input type="hidden" name="web2_target" value="0" />
      <input type="hidden" name="guestpost_target" value="0" />
      <input type="hidden" name="pdf_target" value="0" />
      <input type="hidden" name="profile_target" value="0" />
      <input type="hidden" name="citation_target" value="0" />
      <input type="hidden" name="image_target" value="0" />
      <input type="hidden" name="writer_approach" value="1" />
      <input type="hidden" name="writers_daily_target" value="0" />
      <input type="hidden" name="posts_per_client" value="0" />
      <input type="hidden" name="writer_clients_per_day" value="0" />

      <button type="submit" className="btn btn-primary" disabled={isPending}>
        {isPending ? 'Saving...' : mode === 'create' ? 'Create Campaign' : 'Save Changes'}
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
