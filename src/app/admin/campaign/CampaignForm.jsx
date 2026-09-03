'use client';

import { useActionState, useState } from 'react';
import LinkTargetsFields from '@/components/LinkTargetsFields';
import { createCampaign, updateCampaign } from './actions';

const BRAND_COLOR = '#16b293';

export default function CampaignForm({ mode = 'create', initialData = null, onSuccess }) {
  const [state, formAction, isPending] = useActionState(
    mode === 'create' ? createCampaign : updateCampaign,
    { error: null, success: null }
  );

  const [linkTargets, setLinkTargets] = useState(() => {
    if (initialData) {
      return {
        web2: initialData.web2_target || 7,
        guestpost: initialData.guestpost_target || 7,
        pdf: initialData.pdf_target || 7,
        profile: initialData.profile_target || 10,
        citation: initialData.citation_target || 10,
        image: initialData.image_target || 9
      };
    }
    return {
      web2: 7,
      guestpost: 7,
      pdf: 7,
      profile: 10,
      citation: 10,
      image: 9
    };
  });

  return (
    <form action={formAction}>
      {state?.error && (
        <div style={alertStyle('var(--danger)', 'rgba(239, 68, 68, 0.1)')}>
          <span style={{ fontSize: '1rem' }}>⚠️</span> {state.error}
        </div>
      )}
      {state?.success && (
        <div style={alertStyle('var(--success)', 'rgba(34, 197, 94, 0.1)')}>
          <span style={{ fontSize: '1rem' }}>✓</span> {state.success}
        </div>
      )}

      {mode === 'edit' && <input type="hidden" name="id" value={initialData?.id} />}

      <Section title="Basic Info" subtitle="Name, timing, and rotation shape for this campaign">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <Field label="Campaign Name">
            <input type="text" name="name" defaultValue={initialData?.name || ''} required style={inputStyle} placeholder="e.g. Q1 2025 Campaign" />
          </Field>
          <Field label="Start Date">
            <input type="date" name="start_date" defaultValue={initialData?.start_date || new Date().toISOString().split('T')[0]} style={inputStyle} />
          </Field>
          <Field label="Total Days">
            <input type="number" name="total_days" defaultValue={initialData?.total_days || 16} min="1" style={inputStyle} />
          </Field>
          <Field label="Clients Per Day">
            <input type="number" name="clients_per_day" defaultValue={initialData?.clients_per_day || 4} min="1" style={inputStyle} />
          </Field>
          {mode === 'edit' && (
            <Field label="Status">
              <select name="status" defaultValue={initialData?.status || 'active'} style={inputStyle}>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          )}
        </div>
      </Section>

      <Section title="Link Targets Per Client" subtitle={`Monthly quota per client — currently ${Object.values(linkTargets).reduce((a, b) => a + b, 0)} links/month`}>
        <LinkTargetsFields initialData={initialData} onTargetsChange={setLinkTargets} />
      </Section>

      <div style={{ display: 'flex', gap: '1rem', paddingTop: '0.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={isPending} style={{ padding: '0.65rem 1.5rem', fontWeight: '600' }}>
          {isPending ? 'Saving...' : mode === 'create' ? '+ Create Campaign' : 'Save Changes'}
        </button>

        {mode === 'edit' && (
          <button type="button" onClick={onSuccess} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: '2rem', paddingBottom: '2rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, color: BRAND_COLOR, fontSize: '0.95rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
          {title}
        </h4>
        {subtitle && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '500' }}>{label}</label>
      {children}
      {hint && <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

function alertStyle(color, bg) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color,
    marginBottom: '1.5rem',
    padding: '0.75rem 1rem',
    border: `1px solid ${color}`,
    borderRadius: '0.5rem',
    backgroundColor: bg,
    fontSize: '0.875rem',
  };
}

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
};
