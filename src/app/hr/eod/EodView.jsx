'use client';

import { useMemo, useState } from 'react';
import { cardStyle, selectStyle, formatMonth, StatPill, BRAND_COLOR } from '../hrStyles';

export default function EodView({ reports }) {
  const people = useMemo(() => {
    const seen = new Map();
    for (const r of reports) seen.set(r.manager_id, r.manager_name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [reports]);

  const months = useMemo(() => {
    const set = new Set(reports.map((r) => r.report_date.slice(0, 7)));
    return [...set].sort().reverse();
  }, [reports]);

  const [personId, setPersonId] = useState('');
  const [month, setMonth] = useState(months[0] || '');

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (personId && String(r.manager_id) !== personId) return false;
      if (month && r.report_date.slice(0, 7) !== month) return false;
      return true;
    });
  }, [reports, personId, month]);

  const totalReports = filtered.length;
  const totalEntries = filtered.reduce((s, r) => s + r.entries.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.35rem' }}>EOD Reports</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          End-of-day reports filed by SEO, Web SEO, and Writers Managers.
        </p>
      </div>

      <div style={{ ...cardStyle, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={personId} onChange={(e) => setPersonId(e.target.value)} style={selectStyle}>
          <option value="">All People</option>
          {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} style={selectStyle}>
          <option value="">All Months</option>
          {months.map((ym) => <option key={ym} value={ym}>{formatMonth(ym)}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <StatPill label="Reports" value={totalReports} color={BRAND_COLOR} />
        <StatPill label="Entries" value={totalEntries} color="var(--success)" />
      </div>

      {filtered.length === 0 ? (
        <div style={cardStyle}>
          <p style={{ color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>No reports match these filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((r) => <ReportCard key={r.id} report={r} />)}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={cardStyle}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
            <span style={{ fontWeight: '600' }}>{report.manager_name}</span>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: BRAND_COLOR, fontWeight: '600' }}>
              {report.manager_role}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{report.report_date}</div>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {report.entries.length} client{report.entries.length === 1 ? '' : 's'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {report.entries.map((e) => (
            <div key={e.id} style={{ padding: '0.65rem 0.85rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{e.web_client_name}</span>
                <span style={{ fontSize: '0.75rem', color: BRAND_COLOR, fontWeight: '600' }}>{e.work_done}</span>
              </div>
              {e.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{e.description}</div>}
              {e.page_url && (
                <a href={e.page_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: BRAND_COLOR, textDecoration: 'none' }}>
                  {e.page_url}
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
