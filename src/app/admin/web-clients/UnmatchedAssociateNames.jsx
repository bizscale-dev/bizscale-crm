'use client';

import { useState } from 'react';
import { saveWebAssociateMapping } from './actions';

const BRAND_COLOR = '#f59e0b';

const selectStyle = {
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  minWidth: '200px',
};

/**
 * Associate names read straight from the Web Clients import sheet that didn't
 * match any real web_seo_associate by name — the sheet's raw text is always
 * captured now (see sheet_associate_name in webClientsImport.js), even when
 * unmatched, so it shows up here instead of only appearing once in a sync
 * error. Mapping a name saves it to web_associate_name_mappings and applies
 * immediately to every client currently carrying that sheet name — every
 * future import then resolves it automatically.
 */
export default function UnmatchedAssociateNames({ unmatchedNames, webAssociates }) {
  const [selections, setSelections] = useState({});
  const [saving, setSaving] = useState(null);
  const [message, setMessage] = useState(null);

  if (unmatchedNames.length === 0) return null;

  const handleSave = async (name) => {
    const associateId = selections[name];
    if (!associateId) {
      setMessage({ type: 'error', text: `Pick an associate for "${name}" first` });
      return;
    }
    setSaving(name);
    setMessage(null);
    try {
      const result = await saveWebAssociateMapping(name, associateId);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="card" style={{ border: `1px solid ${BRAND_COLOR}` }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: BRAND_COLOR }}>
        Unmatched Associate Names
      </h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.25rem 0' }}>
        These names appeared in the sheet&apos;s associate column but don&apos;t match any Web SEO
        Associate. Map each one once — it&apos;s applied to their clients now and remembered for
        every future import.
      </p>

      {message && (
        <div style={{
          backgroundColor: message.type === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
          color: message.type === 'error' ? 'var(--danger)' : 'var(--success)',
          padding: '0.75rem 1rem',
          borderRadius: '0.5rem',
          border: `1px solid ${message.type === 'error' ? 'var(--danger)' : 'var(--success)'}`,
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {unmatchedNames.map(({ name, client_count }) => (
          <div key={name} style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem',
          }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <div style={{ fontWeight: '600' }}>{name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {client_count} client{client_count === 1 ? '' : 's'} waiting on this
              </div>
            </div>
            <select
              value={selections[name] || ''}
              onChange={(e) => setSelections(s => ({ ...s, [name]: e.target.value }))}
              style={selectStyle}
            >
              <option value="">Map to associate...</option>
              {webAssociates.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleSave(name)}
              disabled={saving === name}
              className="btn btn-primary"
              style={{ backgroundColor: BRAND_COLOR, color: 'white', border: 'none', cursor: saving === name ? 'not-allowed' : 'pointer' }}
            >
              {saving === name ? 'Saving...' : 'Save Mapping'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
