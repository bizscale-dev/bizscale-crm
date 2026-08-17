'use client';

import { useState } from 'react';
import { getUserActivityReport } from './actions';

const BRAND_COLOR = '#16b293';

const ROLE_LABELS = {
  seo_associate: 'SEO Associates',
  writer: 'Writers',
  web_seo_associate: 'Web SEO Associates',
};

const ROLE_ICONS = {
  seo_associate: '🔗',
  writer: '✍️',
  web_seo_associate: '🌐',
};

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
  transition: 'border-color 0.15s ease',
};

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

export default function UserActivityReport({ users }) {
  const now = new Date();
  const today = toDateStr(now);
  const yesterday = toDateStr(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const [userId, setUserId] = useState('');
  const [date, setDate] = useState(yesterday);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [userFocused, setUserFocused] = useState(false);
  const [dateFocused, setDateFocused] = useState(false);

  const usersByRole = {};
  for (const u of users) {
    if (!usersByRole[u.role]) usersByRole[u.role] = [];
    usersByRole[u.role].push(u);
  }

  const runReport = async (nextUserId, nextDate) => {
    if (!nextUserId || !nextDate) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await getUserActivityReport(parseInt(nextUserId, 10), nextDate);
      if (result.error) {
        setError(result.error);
        setReport(null);
      } else {
        setReport(result);
      }
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = (e) => {
    const val = e.target.value;
    setUserId(val);
    runReport(val, date);
  };

  const handleDateChange = (e) => {
    const val = e.target.value;
    setDate(val);
    runReport(userId, val);
  };

  const jumpToDate = (val) => {
    setDate(val);
    runReport(userId, val);
  };

  const selectedUser = users.find(u => String(u.id) === String(userId));

  return (
    <div className="card">
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '1rem' }}>
        By Person — Daily Activity
      </h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0 0 1.25rem 0' }}>
        Pick a person and a date to see everything they worked on that day.
      </p>

      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: '1', minWidth: '260px' }}>
          <label style={labelStyle}>Person</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', pointerEvents: 'none' }}>
              {selectedUser ? (ROLE_ICONS[selectedUser.role] || '👤') : '👤'}
            </span>
            <select
              value={userId}
              onChange={handleUserChange}
              onFocus={() => setUserFocused(true)}
              onBlur={() => setUserFocused(false)}
              style={{
                ...inputStyle,
                width: '100%',
                paddingLeft: '2.1rem',
                borderColor: userFocused ? BRAND_COLOR : 'var(--border)',
                boxShadow: userFocused ? `0 0 0 3px ${BRAND_COLOR}22` : 'none',
                cursor: 'pointer',
              }}
            >
              <option value="">Select a person...</option>
              {Object.entries(usersByRole).map(([role, roleUsers]) => (
                <optgroup key={role} label={`${ROLE_ICONS[role] || ''} ${ROLE_LABELS[role] || role}`}>
                  {roleUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}{u.is_active ? '' : ' (inactive)'}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Date</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="date"
                className="date-input-brand"
                value={date}
                max={today}
                onChange={handleDateChange}
                onFocus={() => setDateFocused(true)}
                onBlur={() => setDateFocused(false)}
                onClick={(e) => e.target.showPicker?.()}
                style={{
                  ...inputStyle,
                  paddingRight: '2.3rem',
                  borderColor: dateFocused ? BRAND_COLOR : 'var(--border)',
                  boxShadow: dateFocused ? `0 0 0 3px ${BRAND_COLOR}22` : 'none',
                }}
              />
              <svg
                width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={BRAND_COLOR}
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <button
              type="button"
              onClick={() => jumpToDate(today)}
              disabled={date === today}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.5rem',
                border: `1px solid ${date === today ? BRAND_COLOR : 'var(--border)'}`,
                backgroundColor: date === today ? `${BRAND_COLOR}1a` : 'transparent',
                color: date === today ? BRAND_COLOR : 'var(--foreground)',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: date === today ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => jumpToDate(yesterday)}
              disabled={date === yesterday}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '0.5rem',
                border: `1px solid ${date === yesterday ? BRAND_COLOR : 'var(--border)'}`,
                backgroundColor: date === yesterday ? `${BRAND_COLOR}1a` : 'transparent',
                color: date === yesterday ? BRAND_COLOR : 'var(--foreground)',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: date === yesterday ? 'default' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Yesterday
            </button>
          </div>
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      {!loading && !error && report?.notFinalized && (
        <p style={{ color: '#f59e0b' }}>
          {report.date === today
            ? 'Today isn\'t finalized yet — it gets captured into the permanent record at 1 AM tonight. Check back tomorrow for today\'s numbers.'
            : 'This date hasn\'t been finalized yet.'}
        </p>
      )}

      {!loading && !error && !report && userId && (
        <p style={{ color: 'var(--text-muted)' }}>No work recorded for this person on this date.</p>
      )}

      {!loading && report && !report.notFinalized && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.875rem' }}>
            <div><strong>{report.user.name}</strong> ({report.user.email})</div>
            <div>Total tasks for {report.date}: <strong style={{ color: 'var(--primary)' }}>{report.totalCompleted} / {report.totalTarget}</strong></div>
            {report.totalLogs > 0 && <div>{report.totalLogs} logged item(s)</div>}
          </div>

          <SummaryBoxes report={report} />

          {report.sections.every(sec => sec.completedRows.length === 0 && sec.pendingRows.length === 0 && sec.unverifiedRows.length === 0) ? (
            <p style={{ color: 'var(--text-muted)' }}>No work recorded for {report.user.name} on {report.date}.</p>
          ) : (
            report.sections.map(sec => (sec.completedRows.length === 0 && sec.pendingRows.length === 0 && sec.unverifiedRows.length === 0) ? null : (
              <div key={sec.title}>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>{sec.title}</h3>

                {sec.completedRows.length > 0 && (
                  <RowsTable heading="Completed" rows={sec.completedRows} accentColor="var(--success)" />
                )}

                {sec.pendingRows.length > 0 && (
                  <div style={{ marginTop: sec.completedRows.length > 0 ? '1rem' : 0 }}>
                    <RowsTable heading="Assigned but not completed" rows={sec.pendingRows} accentColor="#f59e0b" />
                  </div>
                )}

                {sec.unverifiedRows.length > 0 && (
                  <div style={{ marginTop: (sec.completedRows.length > 0 || sec.pendingRows.length > 0) ? '1.25rem' : 0 }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.4rem 0' }}>
                      These clients/tasks were tracked for the first time on this day, so there&apos;s no earlier day to confirm the numbers are same-day work rather than progress from before tracking started. Still counted in the totals above — flagged here only so a first-time sync can be double-checked.
                    </p>
                    <RowsTable heading="First Day — Unverified" rows={sec.unverifiedRows} accentColor="#94a3b8" />
                  </div>
                )}

                {sec.logs && sec.logs.length > 0 && (
                  <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.4rem 0' }}>Time</th>
                          <th style={{ padding: '0.4rem 0' }}>Client</th>
                          <th style={{ padding: '0.4rem 0' }}>Type</th>
                          <th style={{ padding: '0.4rem 0' }}>URL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sec.logs.map((l, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.4rem 0', color: 'var(--text-muted)' }}>{new Date(l.time).toLocaleTimeString()}</td>
                            <td style={{ padding: '0.4rem 0' }}>{l.client_name}</td>
                            <td style={{ padding: '0.4rem 0' }}>{l.label}</td>
                            <td style={{ padding: '0.4rem 0' }}>
                              {l.url ? (
                                <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                  {l.url}
                                </a>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ title, accentColor, doneLabel, doneValue, pendingLabel, pendingValue, note }) {
  return (
    <div style={{ flex: '1', minWidth: '220px', padding: '1rem', borderRadius: '0.5rem', border: `1px solid ${accentColor}`, backgroundColor: `${accentColor}0d` }}>
      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: accentColor, textTransform: 'uppercase', marginBottom: '0.6rem' }}>
        {title}
      </div>
      <div style={{ display: 'flex', gap: '1.5rem' }}>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>{doneValue}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{doneLabel}</div>
        </div>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>{pendingValue}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pendingLabel}</div>
        </div>
      </div>
      {note && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.6rem' }}>{note}</div>}
    </div>
  );
}

// Three lenses on the same report date: Funnel and Regular split that day's OWN
// tasks by whether the client was Funnel-active; Pending Backlog is a different
// axis entirely — old overdue work from BEFORE that day, tracked separately (see
// daily_pending_snapshot in db.js) since it can't be derived from that day's own
// numbers. Only shown for seo_associate/web_seo_associate — writers have no
// backlog-catchup mechanism (see dailyActivityCapture.js).
function SummaryBoxes({ report }) {
  const funnelPending = report.funnelTarget - report.funnelCompleted;
  const regularCompleted = report.totalCompleted - report.funnelCompleted;
  const regularPending = report.pendingShortfall - funnelPending;
  const showBacklogBox = report.user.role === 'seo_associate' || report.user.role === 'web_seo_associate';

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <StatBox
        title="Funnel"
        accentColor="#16b293"
        doneLabel="Completed today"
        doneValue={report.funnelCompleted}
        pendingLabel="Pending (not done)"
        pendingValue={funnelPending}
      />
      <StatBox
        title="Regular"
        accentColor="var(--primary)"
        doneLabel="Completed today"
        doneValue={regularCompleted}
        pendingLabel="Pending (not done)"
        pendingValue={regularPending}
      />
      {showBacklogBox && (
        <StatBox
          title="Pending Backlog"
          accentColor="#f59e0b"
          doneLabel="Resolved today"
          doneValue={report.pendingResolved}
          pendingLabel="Still stuck"
          pendingValue={report.pendingRemaining}
          note="Old overdue work from before this day — resolved today vs. still outstanding as of this day's capture."
        />
      )}
    </div>
  );
}

function RowsTable({ heading, rows, accentColor }) {
  // Rows arrive sorted by client_name — merge consecutive rows for the same
  // client into one rowSpan'd cell instead of repeating the name every line.
  const runs = [];
  for (let i = 0; i < rows.length; i++) {
    if (i === 0 || rows[i].client_name !== rows[i - 1].client_name) {
      let len = 1;
      while (i + len < rows.length && rows[i + len].client_name === rows[i].client_name) len++;
      runs.push({ start: i, length: len });
    }
  }
  const runStartByIndex = new Map(runs.map(r => [r.start, r.length]));

  return (
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: '600', color: accentColor, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
        {heading}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
              <th style={{ padding: '0.5rem 0' }}>Client</th>
              <th style={{ padding: '0.5rem 0' }}>Type</th>
              <th style={{ padding: '0.5rem 0' }}>Completed / Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {runStartByIndex.has(i) && (
                  <td rowSpan={runStartByIndex.get(i)} style={{ padding: '0.5rem 0', fontWeight: '500', verticalAlign: 'top' }}>
                    {r.client_name}
                  </td>
                )}
                <td style={{ padding: '0.5rem 0' }}>{r.label}</td>
                <td style={{ padding: '0.5rem 0', color: accentColor }}>
                  {r.completed_count} / {r.target_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
