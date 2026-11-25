'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatPkt } from '@/lib/formatTime';
import { markReportFixed, confirmTaskReportFix, rejectTaskReportFix, updateTaskReport, deleteTaskReport } from '@/lib/taskCheckActions';
import ImagePicker from '@/components/taskcheck/ImagePicker';
import MultiImagePicker from '@/components/taskcheck/MultiImagePicker';
import FixImages from '@/components/FixImages';

const STATUS = {
  open: { label: 'Open', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
  pending_review: { label: 'Awaiting check', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
  resolved: { label: 'Resolved', color: 'var(--success)', bg: 'rgba(34, 197, 94, 0.12)' },
};
const btn = { fontSize: '0.8rem', padding: '0.4rem 1rem', border: 'none', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', color: 'white' };
const area = { width: '100%', padding: '0.55rem 0.8rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' };

const ROLE_LABEL = { web_developer_executive: 'Web Developer Executive', web_seo_manager: 'Web SEO Manager', graphic_designer_executive: 'Graphic Designer Executive', qa: 'QA', admin: 'Admin' };
const by = (r) => `${r.reporter_name}${ROLE_LABEL[r.reporter_role] ? ` (${ROLE_LABEL[r.reporter_role]})` : ''}`;

function ReportCard({ report, mode, meId }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [fixImages, setFixImages] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editComment, setEditComment] = useState('');
  const [editLink, setEditLink] = useState('');
  const [newImage, setNewImage] = useState(null);
  const [dropImage, setDropImage] = useState(false);
  const canManage = mode === 'exec' && !!meId && report.created_by === meId;
  const imageUrl = `/api/task-check-report-image/${report.id}?v=${encodeURIComponent(report.edited_at || '')}`;
  const st = STATUS[report.status] || STATUS.open;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res?.error) return setError(res.error);
    setText('');
    setFixImages([]);
    setRejecting(false);
    router.refresh();
  };

  const startEdit = () => {
    setEditComment(report.comment || '');
    setEditLink(report.link || '');
    setNewImage(null);
    setDropImage(false);
    setError(null);
    setEditing(true);
  };
  const saveEdit = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await updateTaskReport({ reportId: report.id, comment: editComment, link: editLink, image: newImage, removeImage: dropImage });
      if (!res?.error) setEditing(false);
      return res;
    });
  };
  const remove = () => {
    if (!confirm('Delete this report? It disappears for the person it was reported to as well.')) return;
    run(() => deleteTaskReport(report.id));
  };

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.1rem 1.25rem', backgroundColor: 'var(--card-bg)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {mode === 'exec' ? <>Task by <strong style={{ color: 'var(--foreground)' }}>{report.assignee_name}</strong> · reported by <strong style={{ color: 'var(--foreground)' }}>{by(report)}</strong></> : <>Reported by <strong style={{ color: 'var(--foreground)' }}>{by(report)}</strong></>} · {formatPkt(report.created_at)}
          {report.rejection_count > 0 ? ` · failed re-check ${report.rejection_count}×` : ''}
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: '600', color: st.color, backgroundColor: st.bg, padding: '0.2rem 0.6rem', borderRadius: '1rem', whiteSpace: 'nowrap' }}>{st.label}{report.edited_at ? ' · edited' : ''}</span>
      </div>
      <div style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap' }}>{report.task_text}</div>
      {editing && (
        <form onSubmit={saveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.8rem', border: '1px solid var(--border)', borderRadius: '0.5rem', backgroundColor: 'var(--background)' }}>
          <textarea value={editComment} onChange={(e) => setEditComment(e.target.value)} rows={3} style={area} placeholder={report.task_id === 0 ? 'Describe the bug…' : 'Comment (optional)'} />
          <input type="text" value={editLink} onChange={(e) => setEditLink(e.target.value)} style={{ ...area, resize: 'none' }} placeholder="Link (optional) https://…" />
          <ImagePicker value={newImage} onChange={(v) => { setNewImage(v); if (v) setDropImage(false); }} existing={report.has_image && !dropImage ? imageUrl : null} onRemoveExisting={() => setDropImage(true)} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={busy} style={{ ...btn, backgroundColor: 'var(--primary)', opacity: busy ? 0.6 : 1 }}>{busy ? 'Saving…' : 'Save changes'}</button>
            <button type="button" onClick={() => setEditing(false)} style={{ ...btn, backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>Cancel</button>
          </div>
        </form>
      )}
      {!editing && report.link && (
        <a href={report.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', color: 'var(--primary)', wordBreak: 'break-all' }}>🔗 {report.link}</a>
      )}
      {!editing && !!report.has_image && (
        <a href={imageUrl} target="_blank" rel="noopener noreferrer" style={{ alignSelf: 'flex-start' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Bug" loading="lazy" style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'block' }} />
        </a>
      )}
      {!editing && report.comment && (
        <div style={{ padding: '0.7rem 0.9rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderLeft: '3px solid #f59e0b', borderRadius: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{report.comment}</div>
      )}
      {report.resolution_note && report.status !== 'open' && (
        <div style={{ padding: '0.7rem 0.9rem', borderRadius: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap', border: `1px solid ${report.status === 'resolved' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.4)'}` }}>
          <div style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', color: st.color, marginBottom: '0.25rem' }}>
            {report.status === 'resolved' ? 'Fix (confirmed)' : 'Says it is fixed'} · {formatPkt(report.resolved_at)}
          </div>
          {report.resolution_note}
          <FixImages base="/api/task-check-fix-image" id={report.id} count={report.fix_image_count} />
        </div>
      )}

      {error && <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{error}</div>}

      {canManage && !editing && (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={startEdit} style={{ ...btn, backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>✎ Edit</button>
          <button type="button" disabled={busy} onClick={remove} style={{ ...btn, backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>🗑 Delete</button>
        </div>
      )}

      {mode === 'mine' && report.status === 'open' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={area} placeholder="What did you fix?" />
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Pictures of the fix (optional)</div>
            <MultiImagePicker value={fixImages} onChange={setFixImages} />
          </div>
          <div><button type="button" disabled={busy} onClick={() => run(() => markReportFixed(report.id, text, fixImages))} style={{ ...btn, backgroundColor: 'var(--primary)', opacity: busy ? 0.6 : 1 }}>Mark as fixed</button></div>
        </div>
      )}
      {mode === 'exec' && report.status === 'pending_review' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rejecting && <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} style={area} placeholder="What is still wrong?" />}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" disabled={busy} onClick={() => run(() => confirmTaskReportFix(report.id))} style={{ ...btn, backgroundColor: 'var(--success)', opacity: busy ? 0.6 : 1 }}>Confirm fix</button>
            {rejecting ? (
              <button type="button" disabled={busy} onClick={() => run(() => rejectTaskReportFix(report.id, text))} style={{ ...btn, backgroundColor: 'var(--danger)', opacity: busy ? 0.6 : 1 }}>Send back</button>
            ) : (
              <button type="button" onClick={() => setRejecting(true)} style={{ ...btn, backgroundColor: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}>Not fixed</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, value, color }) {
  return (
    <div style={{ padding: '0.5rem 1rem', borderRadius: '0.6rem', border: '1px solid var(--border)', backgroundColor: 'var(--card-bg)', minWidth: '110px' }}>
      <div style={{ fontSize: '1.3rem', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</div>
    </div>
  );
}

export default function ReportsClient({ reports, mode, people = [], meId = null }) {
  const count = (s) => reports.filter((r) => r.status === s).length;
  const [person, setPerson] = useState('');
  const visible = person ? reports.filter((r) => String(r.user_id) === person) : reports;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <Pill label="Total" value={reports.length} color="var(--primary)" />
        <Pill label="Open" value={count('open')} color="#f59e0b" />
        <Pill label="Awaiting check" value={count('pending_review')} color="#3b82f6" />
        <Pill label="Resolved" value={count('resolved')} color="var(--success)" />
      </div>
      {mode === 'exec' && people.length > 1 && (
        <select value={person} onChange={(e) => setPerson(e.target.value)} style={{ alignSelf: 'flex-start', padding: '0.45rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.85rem' }}>
          <option value="">Everyone</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      {visible.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No reports yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {visible.map((r) => <ReportCard key={r.id} report={r} mode={mode} meId={meId} />)}
        </div>
      )}
    </div>
  );
}
