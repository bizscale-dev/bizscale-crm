'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRankingCheckTasks, deleteRankingCheckTask } from './rankingActions';

const labelStyle = { display: 'block', marginBottom: '0.4rem', fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inputStyle = { width: '100%', padding: '0.6rem 0.85rem', borderRadius: '0.6rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
const primaryButtonStyle = { padding: '0.7rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '0.6rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' };
const cardStyle = { backgroundColor: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.9rem', padding: '1.5rem' };

const labelOf = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
const todayIso = () => new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10); // Pakistan date

const AUDIENCES = [
  { key: 'seo', label: 'SEO associates', hint: 'SEO and Senior SEO — each gets their own clients' },
  { key: 'web', label: 'Web SEO associates', hint: 'each gets the web clients assigned to them' },
];

function Notice({ message }) {
  if (!message) return null;
  return (
    <div style={{ padding: '0.75rem 1rem', borderRadius: '0.5rem', fontSize: '0.875rem', backgroundColor: message.error ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 178, 147, 0.1)', color: message.error ? 'var(--danger)' : 'var(--success)' }}>
      {message.text}
    </div>
  );
}

// tasks: [{ id, title, due_date, people: [{ name, role, total, done, submitted }] }]
export default function RankingChecksSection({ tasks = [] }) {
  const router = useRouter();
  const [title, setTitle] = useState('Ranking check');
  const [dates, setDates] = useState([]);
  const [pick, setPick] = useState('');
  const [audiences, setAudiences] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [dateError, setDateError] = useState(null);

  const addDate = () => {
    setDateError(null);
    if (!pick) return;
    if (isWeekend(pick)) return setDateError(`${labelOf(pick)} is a weekend — pick a weekday.`);
    if (pick < todayIso()) return setDateError('That date has already passed.');
    setDates((d) => [...new Set([...d, pick])].sort());
    setPick('');
  };

  const toggleAudience = (key) => setAudiences((a) => (a.includes(key) ? a.filter((x) => x !== key) : [...a, key]));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await createRankingCheckTasks({ title, dates, audiences });
    setBusy(false);
    if (res?.error) return setMessage({ error: true, text: res.error });
    const skipped = res.noClients?.length ? ` No clients assigned, so nothing was created for: ${res.noClients.join(', ')}.` : '';
    setMessage({ text: `Created ${res.taskCount} task${res.taskCount === 1 ? '' : 's'} for ${res.assignedCount} associate${res.assignedCount === 1 ? '' : 's'}.${skipped}` });
    setDates([]); setAudiences([]); setTitle('Ranking check');
    router.refresh();
  };

  const remove = async (t) => {
    if (!confirm(`Delete "${t.title}" due ${labelOf(t.due_date)}? Everyone's ticks on it are removed too.`)) return;
    const res = await deleteRankingCheckTask(t.id);
    if (res?.error) return setMessage({ error: true, text: res.error });
    router.refresh();
  };

  return (
    <>
      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>📈 Ranking check tasks</h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Pick the deadline(s), then who gets it. Every associate sees a checkbox for each of <strong>their own</strong> clients only, and the task is done when all of them are ticked.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Notice message={message} />
          <div>
            <label style={labelStyle}>Task name</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. Overall rankings check" />
          </div>
          <div>
            <label style={labelStyle}>Deadline dates (weekdays only)</label>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              <input type="date" className="date-input-brand" value={pick} min={todayIso()} onChange={(e) => { setPick(e.target.value); setDateError(null); }}
                onClick={(e) => e.target.showPicker?.()} style={{ ...inputStyle, width: 'auto', minWidth: '170px', cursor: 'pointer' }} />
              <button type="button" onClick={addDate} disabled={!pick} style={{ ...primaryButtonStyle, padding: '0.55rem 1.1rem', opacity: pick ? 1 : 0.5 }}>+ Add date</button>
            </div>
            {dateError && <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.4rem' }}>{dateError}</div>}
            {dates.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.7rem' }}>
                {dates.map((d) => (
                  <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.3rem 0.7rem', borderRadius: '2rem', border: '1px solid var(--border)', fontSize: '0.82rem' }}>
                    {labelOf(d)}
                    <button type="button" onClick={() => setDates((x) => x.filter((v) => v !== d))} aria-label="Remove date"
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Who gets it</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {AUDIENCES.map((a) => (
                <label key={a.key} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={audiences.includes(a.key)} onChange={() => toggleAudience(a.key)} />
                  <span><strong>{a.label}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>· {a.hint}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <button type="submit" disabled={busy} style={{ ...primaryButtonStyle, opacity: busy ? 0.6 : 1 }}>{busy ? 'Creating…' : 'Create ranking check'}</button>
          </div>
        </form>
      </div>

      <div style={cardStyle}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>Ranking checks created ({tasks.length})</h2>
        {tasks.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None yet. Create one above.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {tasks.map((t) => {
              const doneCount = t.people.filter((p) => p.submitted).length;
              return (
                <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: '0.7rem', padding: '0.9rem 1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: '600' }}>{t.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Deadline {labelOf(t.due_date)} · {doneCount}/{t.people.length} finished</div>
                    </div>
                    <button type="button" onClick={() => remove(t)} style={{ padding: '0.4rem 0.9rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>Delete</button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.7rem' }}>
                    {t.people.map((p) => (
                      <span key={p.name} style={{ fontSize: '0.76rem', padding: '0.2rem 0.6rem', borderRadius: '2rem', border: `1px solid ${p.submitted ? 'var(--success)' : 'var(--border)'}`, color: p.submitted ? 'var(--success)' : 'var(--text-muted)' }}>
                        {p.submitted ? '✓ ' : ''}{p.name} · {p.done}/{p.total}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
