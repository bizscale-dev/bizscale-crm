'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createLinkTarget,
  deleteLinkTarget,
  resetLinkTargetsToDefaults,
  updateLinkTarget,
} from './actions';

import {
  DEFAULT_LINK_TARGETS,
  LINK_TYPE_LABELS,
  LINK_TYPE_TARGET_FIELDS,
  LINK_TYPES,
} from '@/lib/linkTargetConstants';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
};

const btnSmall = {
  fontSize: '0.75rem',
  padding: '0.25rem 0.5rem',
};

export default function LinkTargetsManager({ linkTargets, totalLinksPerClient }) {
  const router = useRouter();
  const [editingType, setEditingType] = useState(null);
  const [createState, createAction, isCreating] = useActionState(createLinkTarget, {
    error: null,
    success: null,
  });
  const [updateState, updateAction, isUpdating] = useActionState(updateLinkTarget, {
    error: null,
    success: null,
  });

  const feedback = createState?.error || createState?.success || updateState?.error || updateState?.success;

  useEffect(() => {
    if (createState?.success || updateState?.success) {
      setEditingType(null);
      router.refresh();
    }
  }, [createState?.success, updateState?.success, router]);

  const handleDelete = async (linkType, label) => {
    if (!confirm(`Remove ${label} target? This sets it to 0.`)) return;
    await deleteLinkTarget(linkType);
    router.refresh();
  };

  const handleReset = async () => {
    if (!confirm('Reset all link targets to default values?')) return;
    await resetLinkTargetsToDefaults();
    router.refresh();
  };

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '1rem',
          borderBottom: '1px solid var(--border)',
          paddingBottom: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Link Targets Per Client</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.5rem 0 0' }}>
            Total links per client: <strong>{totalLinksPerClient}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="btn"
          style={{
            fontSize: '0.875rem',
            padding: '0.5rem 0.75rem',
            backgroundColor: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--foreground)',
            whiteSpace: 'nowrap',
          }}
        >
          Reset to Defaults
        </button>
      </div>

      {feedback && (
        <div
          style={{
            color: createState?.error || updateState?.error ? 'var(--danger)' : 'var(--success)',
            marginBottom: '1rem',
            padding: '0.75rem',
            border: `1px solid ${createState?.error || updateState?.error ? 'var(--danger)' : 'var(--success)'}`,
            borderRadius: '0.5rem',
            backgroundColor:
              createState?.error || updateState?.error
                ? 'rgba(239, 68, 68, 0.1)'
                : 'rgba(34, 197, 94, 0.1)',
          }}
        >
          {feedback}
        </div>
      )}

      <form
        action={createAction}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px auto',
          gap: '1rem',
          alignItems: 'end',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Add Link Target
          </label>
          <select name="link_type" required style={inputStyle} defaultValue="web2">
            {linkTargets.map((item) => (
              <option key={item.linkType} value={item.linkType}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
            Target Count
          </label>
          <input type="number" name="target" min="1" required defaultValue="7" style={inputStyle} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={isCreating}>
          {isCreating ? 'Adding...' : 'Add'}
        </button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.75rem 0' }}>Link Type</th>
              <th style={{ padding: '0.75rem 0' }}>Target Count</th>
              <th style={{ padding: '0.75rem 0' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {linkTargets.map((item) => (
              <tr key={item.linkType} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 0', fontWeight: '500' }}>{item.label}</td>
                <td style={{ padding: '0.75rem 0' }}>
                  {editingType === item.linkType ? (
                    <form
                      action={updateAction}
                      style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: '220px' }}
                      onSubmit={() => setEditingType(null)}
                    >
                      <input type="hidden" name="link_type" value={item.linkType} />
                      <input
                        type="number"
                        name="target"
                        min="0"
                        required
                        defaultValue={item.target || DEFAULT_LINK_TARGETS[item.linkType]}
                        style={{ ...inputStyle, width: '100px' }}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isUpdating}
                        style={{ ...btnSmall, padding: '0.35rem 0.65rem' }}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingType(null)}
                        className="btn"
                        style={{
                          ...btnSmall,
                          padding: '0.35rem 0.65rem',
                          backgroundColor: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--foreground)',
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : item.target > 0 ? (
                    item.target
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  )}
                </td>
                <td style={{ padding: '0.75rem 0' }}>
                  {editingType !== item.linkType && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      {item.target === 0 && (
                        <form action={createAction} style={{ display: 'inline' }}>
                          <input type="hidden" name="link_type" value={item.linkType} />
                          <input
                            type="hidden"
                            name="target"
                            value={DEFAULT_LINK_TARGETS[item.linkType]}
                          />
                          <button
                            type="submit"
                            className="btn btn-primary"
                            style={btnSmall}
                            disabled={isCreating}
                          >
                            ➕ Add
                          </button>
                        </form>
                      )}
                      {item.target > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditingType(item.linkType)}
                            className="btn"
                            style={{
                              ...btnSmall,
                              backgroundColor: 'transparent',
                              border: '1px solid var(--border)',
                              color: 'var(--foreground)',
                            }}
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.linkType, item.label)}
                            className="btn"
                            style={{
                              ...btnSmall,
                              backgroundColor: 'var(--danger)',
                              color: 'white',
                              border: 'none',
                            }}
                          >
                            🗑️ Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
