'use client';

import { useState } from 'react';
import { getQaManagerEodReports, reportEodEntry } from '../actions';
import Linkify from '../../Linkify';

const BRAND_COLOR = 'var(--primary)';

// Groups a flat list of entries first by client/heading name, then within each
// client by the exact (work done, description) pair — so pages saved together
// in one go collapse into one block listing every page once. Same grouping the
// admin EOD view uses (admin/eods/[id]/EodManagerReports.jsx).
function groupEntriesForDisplay(entries) {
  const clientGroups = [];
  const byClient = new Map();
  entries.forEach((e) => {
    const name = e.web_client_name;
    if (!byClient.has(name)) {
      const group = { name, workGroups: [] };
      byClient.set(name, group);
      clientGroups.push(group);
    }
    const clientGroup = byClient.get(name);
    const description = e.description || '';
    let workGroup = clientGroup.workGroups.find((w) => w.workDone === e.work_done && w.description === description);
    if (!workGroup) {
      workGroup = { workDone: e.work_done, description, items: [] };
      clientGroup.workGroups.push(workGroup);
    }
    workGroup.items.push(e);
  });
  return clientGroups;
}

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

export default function QaEodReports({ managerId, webClients, initialReports, initialReportCounts }) {
  const [webClientId, setWebClientId] = useState('');
  const [date, setDate] = useState('');
  const [reports, setReports] = useState(initialReports);
  const [reportCounts, setReportCounts] = useState(initialReportCounts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [reportingId, setReportingId] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reportError, setReportError] = useState(null);

  const runQuery = async (nextWebClientId, nextDate) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getQaManagerEodReports(managerId, {
        webClientId: nextWebClientId || null,
        date: nextDate || null,
      });
      if (result.error) {
        setError(result.error);
        setReports([]);
      } else {
        setReports(result.reports);
        setReportCounts(result.reportCounts);
      }
    } catch (err) {
      setError(err.message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleWebClientChange = (e) => {
    setWebClientId(e.target.value);
    runQuery(e.target.value, date);
  };

  const handleDateChange = (e) => {
    setDate(e.target.value);
    runQuery(webClientId, e.target.value);
  };

  const clearFilters = () => {
    setWebClientId('');
    setDate('');
    runQuery('', '');
  };

  const openReportForm = (entryId) => {
    setReportingId(entryId);
    setNote('');
    setReportError(null);
  };

  const submitReport = async () => {
    setSubmitting(true);
    setReportError(null);
    const result = await reportEodEntry(reportingId, note);
    setSubmitting(false);
    if (result?.error) {
      setReportError(result.error);
      return;
    }
    setReportCounts((prev) => ({ ...prev, [reportingId]: (prev[reportingId] || 0) + 1 }));
    setReportingId(null);
    setNote('');
  };

  const hasFilters = !!webClientId || !!date;
  const totalEntries = reports.reduce((sum, r) => sum + r.entries.length, 0);

  return (
    <>
      <div className="card">
        <h2 style={{ fontSize: '1.1rem', margin: 0, marginBottom: '1.25rem' }}>Search</h2>

        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '240px' }}>
            <label style={labelStyle}>Website</label>
            <select value={webClientId} onChange={handleWebClientChange} style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}>
              <option value="">All websites</option>
              {webClients.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Day</label>
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
              style={{ padding: '0.6rem 1rem', backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem' }}
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
          <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{hasFilters ? 'Matching Reports' : 'All Reports'}</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {reports.length} {reports.length === 1 ? 'report' : 'reports'} · {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>Loading...</p>
        ) : reports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
            {hasFilters ? 'No reports match this search.' : 'This manager hasn’t submitted any reports yet.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
            {reports.map((report) => (
              <div key={report.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: BRAND_COLOR }}>{report.report_date}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {report.entries.length} {report.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {groupEntriesForDisplay(report.entries).map((group) => (
                    <div key={group.name} style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '0.5rem' }}>{group.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {group.workGroups.map((wg, wi) => (
                          <div key={wi} style={{ paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.4rem' }}>
                              {wg.items.map((entry) => (
                                <div key={entry.id}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                    {entry.page_url ? (
                                      <a href={entry.page_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: BRAND_COLOR, wordBreak: 'break-all', textDecoration: 'none' }}>
                                        {entry.page_url}
                                      </a>
                                    ) : (
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No specific page</span>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                                      {reportCounts[entry.id] > 0 && (
                                        <span style={{ fontSize: '0.68rem', fontWeight: '600', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.12)', padding: '0.1rem 0.45rem', borderRadius: '1rem' }}>
                                          ⚑ Flagged{reportCounts[entry.id] > 1 ? ` ×${reportCounts[entry.id]}` : ''}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => openReportForm(entry.id)}
                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.2rem 0.55rem', fontSize: '0.7rem', fontWeight: '600', color: 'var(--foreground)', cursor: 'pointer' }}
                                      >
                                        Report
                                      </button>
                                    </div>
                                  </div>

                                  {reportingId === entry.id && (
                                    <div style={{ marginTop: '0.5rem', padding: '0.75rem', border: '1px solid rgba(245, 158, 11, 0.45)', borderRadius: '0.5rem', backgroundColor: 'rgba(245, 158, 11, 0.05)' }}>
                                      <label style={labelStyle}>What’s wrong with this?</label>
                                      <textarea
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        rows={3}
                                        placeholder="Add a note — e.g. link is broken, page doesn't match the work described..."
                                        style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                                      />
                                      {reportError && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: '0.4rem' }}>{reportError}</div>}
                                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                                        <button
                                          type="button"
                                          onClick={submitReport}
                                          disabled={submitting}
                                          style={{ padding: '0.45rem 1rem', backgroundColor: '#f59e0b', color: 'white', border: 'none', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
                                        >
                                          {submitting ? 'Submitting...' : 'Submit report'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setReportingId(null)}
                                          style={{ padding: '0.45rem 1rem', backgroundColor: 'transparent', color: 'var(--foreground)', border: '1px solid var(--border)', borderRadius: '0.4rem', fontWeight: '600', fontSize: '0.8rem', cursor: 'pointer' }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                              <Linkify text={wg.workDone} />
                            </div>
                            {wg.description && (
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', whiteSpace: 'pre-wrap' }}>
                                <Linkify text={wg.description} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
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
