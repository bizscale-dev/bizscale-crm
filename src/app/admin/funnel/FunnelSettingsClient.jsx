'use client';

import { useState } from 'react';
import { updateFunnelBonusTargets } from './actions';
import { FUNNEL_BONUS_FIELDS } from '@/lib/funnelConstants';

const BRAND_COLOR = '#16b293';

export default function FunnelSettingsClient({ campaign, linkTypes, linkTypeLabels }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (formData) => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await updateFunnelBonusTargets(campaign.id, formData);
      setMessage(result.error ? { type: 'error', text: result.error } : { type: 'success', text: result.success });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Month 2 &amp; 3 Bonus Link Targets</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0, marginBottom: '1.5rem' }}>
        During Funnel months 2 and 3, each link type&apos;s monthly checklist count is the campaign&apos;s normal target
        plus the bonus below (e.g. a normal target of 10 with a bonus of 10 becomes 20 items that month).
      </p>

      <form action={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {linkTypes.map((type) => (
            <div key={type}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted)', display: 'block', marginBottom: '0.4rem' }}>
                {linkTypeLabels[type]}
              </label>
              <input
                type="number"
                name={type}
                min="0"
                defaultValue={campaign[FUNNEL_BONUS_FIELDS[type]] || 0}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid var(--border)',
                  borderRadius: '0.5rem',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.6rem 1.25rem',
            backgroundColor: BRAND_COLOR,
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            fontSize: '0.875rem',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? 'Saving...' : 'Save Bonus Targets'}
        </button>

        {message && (
          <span style={{ marginLeft: '1rem', fontSize: '0.875rem', color: message.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
            {message.text}
          </span>
        )}
      </form>
    </div>
  );
}
