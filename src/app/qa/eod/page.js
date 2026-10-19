import { getDb } from '@/lib/db';
import Link from 'next/link';

export const revalidate = 0;

const BRAND_COLOR = 'var(--primary)';
const ROLE_LABELS = {
  web_seo_manager: 'Web SEO Manager',
  seo_manager: 'SEO Manager',
  writers_manager: 'Writers Manager',
};

export default async function QaEodPage() {
  const db = await getDb();

  const managers = await db.prepare(`
    SELECT u.id, u.name, u.email, u.is_active, u.role,
      (SELECT COUNT(*) FROM eod_reports r WHERE r.user_id = u.id) as report_count,
      (SELECT COUNT(*) FROM eod_report_entries e
        JOIN eod_reports r ON r.id = e.report_id WHERE r.user_id = u.id) as entry_count,
      (SELECT MAX(r.report_date) FROM eod_reports r WHERE r.user_id = u.id) as last_report_date,
      (SELECT COUNT(*) FROM qa_reports q WHERE q.manager_id = u.id) as flagged_count
    FROM users u
    WHERE u.role IN ('web_seo_manager', 'seo_manager', 'writers_manager')
    ORDER BY u.role, u.name
  `).all();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', margin: 0, marginBottom: '0.5rem' }}>EOD Reports</h1>
        <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.875rem' }}>
          Pick a manager to review their end-of-day reports — search by website or date, open the
          links, and flag anything that doesn&apos;t check out.
        </p>
      </div>

      {managers.length === 0 ? (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>No managers exist yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {managers.map(m => (
            <Link
              key={m.id}
              href={`/qa/eod/${m.id}`}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600' }}>{m.name}</h3>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{m.email}</span>
                  <div style={{ marginTop: '0.35rem' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.45rem', borderRadius: '0.25rem', backgroundColor: 'rgba(22, 178, 147, 0.1)', color: BRAND_COLOR, fontWeight: '600', whiteSpace: 'nowrap' }}>
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </div>
                </div>
                {!m.is_active && (
                  <span style={{ fontSize: '0.65rem', padding: '0.2rem 0.45rem', borderRadius: '0.25rem', backgroundColor: 'var(--border)', color: 'var(--text-muted)', fontWeight: '600', whiteSpace: 'nowrap' }}>
                    INACTIVE
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                {[
                  ['Reports', m.report_count],
                  ['Entries', m.entry_count],
                  ['Flagged', m.flagged_count],
                ].map(([label, value]) => (
                  <div key={label} style={{ padding: '0.65rem', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{label}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '600', color: label === 'Flagged' && value > 0 ? '#f59e0b' : undefined }}>{value || 0}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {m.last_report_date ? `Last report: ${m.last_report_date}` : 'No reports yet'}
              </div>
              <div style={{ marginTop: '0.85rem', fontSize: '0.8rem', fontWeight: '600', color: BRAND_COLOR }}>
                Review reports →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
