'use client';

import { useState, useRef, useEffect } from 'react';
import { getOffDaysForActiveCampaignAction, toggleOffDayAction } from './offDaysActions';

const BRAND_COLOR = '#16b293';
const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startOffset = firstDay.getDay(); // 0 = Sunday

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);

  return cells;
}

function toDateStr(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export default function AdminHeaderCalendar() {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [offDays, setOffDays] = useState(new Set());
  const [pendingDate, setPendingDate] = useState(null);
  const containerRef = useRef(null);

  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = getMonthGrid(year, month);

  useEffect(() => {
    if (!open) return;
    getOffDaysForActiveCampaignAction().then(result => {
      if (result.offDays) setOffDays(new Set(result.offDays));
    });
  }, [open]);

  const isWorkingDay = (day) => {
    const dow = new Date(year, month, day).getDay();
    return dow !== 0 && dow !== 6;
  };

  const workingDaysCount = cells.filter(day => {
    if (!day) return false;
    if (!isWorkingDay(day)) return false;
    return !offDays.has(toDateStr(year, month, day));
  }).length;

  const isToday = (day) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const changeMonth = (delta) => {
    setViewDate(new Date(year, month + delta, 1));
  };

  const handleDayClick = async (day) => {
    const dateStr = toDateStr(year, month, day);
    const wasOff = offDays.has(dateStr);

    const confirmText = wasOff
      ? `Make ${dateStr} a working day again?`
      : `Mark ${dateStr} as a day off? No tasks will be generated for anyone on this date. Regenerate tasks from Admin → Tasks afterward to apply this to already-scheduled days.`;
    if (!confirm(confirmText)) return;

    setPendingDate(dateStr);
    // Optimistic update
    setOffDays(current => {
      const next = new Set(current);
      if (wasOff) next.delete(dateStr); else next.add(dateStr);
      return next;
    });

    const result = await toggleOffDayAction(dateStr);
    if (result.error) {
      // Revert on failure
      setOffDays(current => {
        const next = new Set(current);
        if (wasOff) next.add(dateStr); else next.delete(dateStr);
        return next;
      });
      alert('Error: ' + result.error);
    }
    setPendingDate(null);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--border)',
          backgroundColor: open ? 'rgba(22, 178, 147, 0.1)' : 'transparent',
          color: 'var(--text-muted)',
          fontSize: '0.875rem',
          cursor: 'pointer'
        }}
      >
        <span>📅</span>
        <span>{today.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          right: 0,
          width: '300px',
          backgroundColor: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
          padding: '1rem',
          zIndex: 100
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.5rem' }}
            >
              ‹
            </button>
            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>
              {viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem 0.5rem' }}
            >
              ›
            </button>
          </div>

          <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Click a weekday to mark it as a day off — no tasks will be assigned to anyone that day.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', marginBottom: '0.5rem' }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                {label}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.25rem', marginBottom: '0.75rem' }}>
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const working = isWorkingDay(day);
              const todayCell = isToday(day);
              const dateStr = toDateStr(year, month, day);
              const isOff = offDays.has(dateStr);
              const isPending = pendingDate === dateStr;

              let bg = 'transparent';
              let color = 'var(--text-muted)';
              if (isOff) {
                bg = 'rgba(239, 68, 68, 0.15)';
                color = 'var(--danger)';
              } else if (todayCell) {
                bg = BRAND_COLOR;
                color = 'white';
              } else if (working) {
                bg = 'rgba(22, 178, 147, 0.08)';
                color = 'var(--foreground)';
              }

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  disabled={isPending}
                  title={isOff ? 'Day off — click to make a working day' : working ? 'Working day — click to mark as day off' : 'Weekend — click to mark as day off (already non-working)'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    borderRadius: '0.35rem',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: todayCell ? '700' : '500',
                    color,
                    backgroundColor: bg,
                    opacity: isPending ? 0.5 : (working || todayCell || isOff ? 1 : 0.5),
                    cursor: isPending ? 'not-allowed' : 'pointer',
                    textDecoration: isOff ? 'line-through' : 'none'
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            <LegendDot color="rgba(22, 178, 147, 0.4)" label="Working day" />
            <LegendDot color="var(--danger)" label="Day off" />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Regenerate tasks to apply changes</span>
            <strong style={{ color: BRAND_COLOR, fontSize: '0.85rem' }}>{workingDaysCount} working days</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <span>
      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: color, marginRight: '0.35rem' }} />
      {label}
    </span>
  );
}
