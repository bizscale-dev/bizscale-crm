'use client';

import { useState } from 'react';
import { getManagerEodReports } from '../actions';

const BRAND_COLOR = 'var(--primary)';

const labelStyle = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
};

const inputStyle = {
  padding: '0.6rem 0.85rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--background)',
  color: 'var(--foreground)',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function EodManagerReports({ managerId, webClients, initialReports }) {
  const [webClientId, setWebClientId] = useState('');
  const [date, setDate] = useState('');
  const [reports, setReports] = useState(initialReports);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runQuery = async (nextWebClientId, nextDate) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getManagerEodReports(managerId, {
        webClientId: nextWebClientId || null,
        date: nextDate || null,
      });
      if (result.error) {
        setError(result.error);
        setReports([]);
      } else {
        setReports(result.reports);
      }
    } catch (err) {
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWebClientChange = (e) => {
    const val = e.target.value;
    setWebClientId(val);
    runQuery(val, date);
  };

  const handleDateChange = (e) => {
    const val = e.target.value;
    setDate(val);
    runQuery(webClientId, val);
  };

  const clearFilters = () => {
    setWebClientId('');
    setDate('');
    runQuery('', '');
  };

  const hasFilters = !!webClientId || !!date;
  const totalEntries = reports.reduce((sum, r) => sum + r.entries.length, 0);

  return (
    <>
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '1.25rem' }}>Filters</h2>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '240px' }}>
            <label style={labelStyle}>Website</label>
            <select
              value={webClientId}
              onChange={handleWebClientChange}
              style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
            >
              <option value="">All websites</option>
              {webClients.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              className="date-input-brand"
              value={date}
              onChange={handleDateChange}
              onClick={(e) => e.target.showPicker?.()}
              style={inputStyle}
            />
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              style={{
                padding: '0.6rem 1rem',
                backgroundColor: 'transparent',
                color: 'var(--foreground)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.85rem',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="card">
          <p style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
            {hasFilters ? 'Matching Reports' : 'All Reports'}
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {reports.length} {reports.length === 1 ? 'report' : 'reports'} · {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Loading...</p>
        ) : reports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            {hasFilters ? 'No reports match these filters.' : 'This manager hasn’t submitted any reports yet.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {reports.map(report => (
              <div key={report.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: BRAND_COLOR }}>{report.report_date}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {report.entries.length} {report.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {report.entries.map(entry => (
                    <div key={entry.id} style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>{entry.web_client_name}</div>
                      {entry.page_url && (
                        <a href={entry.page_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: '0.75rem', color: BRAND_COLOR, marginTop: '0.2rem', wordBreak: 'break-all', textDecoration: 'none' }}>
                          {entry.page_url}
                        </a>
                      )}
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{entry.work_done}</div>
                      {entry.description && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{entry.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
