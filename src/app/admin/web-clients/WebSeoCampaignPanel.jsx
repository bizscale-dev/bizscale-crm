'use client';

import { useState } from 'react';
import { createWebSeoCampaign, toggleWebSeoCampaignOffDayAction } from './actions';

const BRAND_COLOR = '#16b293';

const inputStyle = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)'
};

/**
 * Web SEO's own independent campaign — its own start_date/total_days, decoupled
 * from the main (SEO) campaigns table (see webseo_campaigns in src/lib/db.js),
 * mirroring the Writer Campaign panel on /admin/writers.
 */
export default function WebSeoCampaignPanel({ campaign = null, offDays = [] }) {
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(null);
  const [newName, setNewName] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newTotalDays, setNewTotalDays] = useState(16);
  const [newWeb2Target, setNewWeb2Target] = useState(campaign?.webseo_web2_target ?? 7);
  const [newGuestpostTarget, setNewGuestpostTarget] = useState(campaign?.webseo_guestpost_target ?? 7);
  const [newOffDate, setNewOffDate] = useState('');

  const handleCreate = async () => {
    if (!newStartDate) {
      setMessage({ type: 'error', text: 'Pick a start date for the Web SEO campaign' });
      return;
    }
    if (!confirm(`Start a new Web SEO campaign on ${newStartDate}? This ends the current one (if any).`)) return;

    setCreating(true);
    setMessage(null);
    try {
      const formData = new FormData();
      formData.set('name', newName);
      formData.set('start_date', newStartDate);
      formData.set('total_days', newTotalDays);
      formData.set('webseo_web2_target', newWeb2Target);
      formData.set('webseo_guestpost_target', newGuestpostTarget);
      const result = await createWebSeoCampaign(null, formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: result.success });
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  };

  const handleToggleOffDay = async (dateStr) => {
    try {
      const result = await toggleWebSeoCampaignOffDayAction(dateStr);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setNewOffDate('');
        window.location.reload();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="card" style={{ border: `1px solid ${BRAND_COLOR}` }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Web SEO Campaign</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1rem 0' }}>
        Controls Web SEO&apos;s import/rotation schedule independently of the SEO campaign —
        its own dates, duration, and link targets.
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

      {campaign ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
            <div><strong>Name:</strong> {campaign.name}</div>
            <div><strong>Status:</strong> {campaign.status}</div>
            <div><strong>Start Date:</strong> {campaign.start_date}</div>
            <div><strong>Total Days:</strong> {campaign.total_days}</div>
            <div><strong>Web 2.0 Target:</strong> {campaign.webseo_web2_target}</div>
            <div><strong>Guest Post Target:</strong> {campaign.webseo_guestpost_target}</div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Off Days</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              {offDays.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>None set</span>
              ) : (
                offDays.map(od => (
                  <span key={od.off_date} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                    padding: '0.25rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem',
                    backgroundColor: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b',
                  }}>
                    {od.off_date}
                    <button onClick={() => handleToggleOffDay(od.off_date)} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontWeight: '700', padding: 0 }}>×</button>
                  </span>
                ))
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="date" value={newOffDate} onChange={(e) => setNewOffDate(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
              <button onClick={() => handleToggleOffDay(newOffDate)} disabled={!newOffDate} className="btn" style={{ backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)', cursor: newOffDate ? 'pointer' : 'not-allowed' }}>
                Add Off Day
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>No active Web SEO campaign — start one below.</p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Name</label>
          <input type="text" placeholder="e.g. September Web SEO" value={newName} onChange={(e) => setNewName(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Start Date</label>
          <input type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Total Days</label>
          <input type="number" min="1" value={newTotalDays} onChange={(e) => setNewTotalDays(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Web 2.0 Target</label>
          <input type="number" min="0" value={newWeb2Target} onChange={(e) => setNewWeb2Target(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', fontWeight: '500' }}>Guest Post Target</label>
          <input type="number" min="0" value={newGuestpostTarget} onChange={(e) => setNewGuestpostTarget(e.target.value)} style={{ ...inputStyle, width: '100px' }} />
        </div>
        <button onClick={handleCreate} disabled={creating} className="btn btn-primary" style={{ backgroundColor: BRAND_COLOR, color: 'white', border: 'none', cursor: creating ? 'not-allowed' : 'pointer' }}>
          {creating ? 'Starting...' : (campaign ? 'Start New Web SEO Campaign' : 'Start Web SEO Campaign')}
        </button>
      </div>
    </div>
  );
}
