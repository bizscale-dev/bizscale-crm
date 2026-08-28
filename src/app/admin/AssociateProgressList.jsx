'use client';

import { useState } from 'react';

const BRAND_COLOR = 'var(--primary)';

// Same overall progress row as before, but each associate is now clickable —
// expanding to show their own day-by-day breakdown (own-day target vs. done,
// same convention as the Daily Summary tables elsewhere) inline, right here.
export default function AssociateProgressList({ associates, dailyByAssociate }) {
  const [expandedId, setExpandedId] = useState(null);

  const visible = associates.slice(0, 5);
  const overflowCount = associates.length - visible.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {visible.map(ap => {
        const percent = ap.target > 0 ? Math.round((ap.completed / ap.target) * 100) : 0;
        const isOpen = expandedId === ap.id;
        const days = dailyByAssociate[ap.id] || [];

        return (
          <div key={ap.id}>
            <button
              type="button"
              onClick={() => setExpandedId(isOpen ? null : ap.id)}
              style={{
                width: '100%', display: 'block', textAlign: 'left', background: 'transparent',
                border: 'none', padding: '0.5rem 0', cursor: 'pointer', color: 'inherit', font: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{isOpen ? '▾' : '▸'}</span>
                  {ap.name}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {ap.completed} / {ap.target} ({percent}%)
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${percent}%`, height: '100%', backgroundColor: BRAND_COLOR, transition: 'width 0.5s ease-out' }}></div>
              </div>
            </button>

            {isOpen && (
              <div style={{ margin: '0.5rem 0 0.75rem 0', padding: '0.75rem 1rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                {days.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>No daily tasks scheduled.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {days.map(d => {
                      const dayPct = d.target > 0 ? Math.round((d.dayCompleted / d.target) * 100) : 0;
                      return (
                        <div key={d.task_date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Day {d.day_number} — {d.task_date}</span>
                          <span style={{ whiteSpace: 'nowrap' }}>{d.dayCompleted}/{d.target} ({dayPct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      {overflowCount > 0 && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          +{overflowCount} more associates
        </p>
      )}
    </div>
  );
}
