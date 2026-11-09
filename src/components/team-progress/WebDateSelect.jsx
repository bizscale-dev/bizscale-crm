'use client';

import { useRouter } from 'next/navigation';

// Reloads the associate's page with ?date=<day> (keeping any other query such as ?campaign=) — the
// same "Select Date" dropdown the SEO associate pages have.
export default function WebDateSelect({ availableDates, selectedDate, today, basePath }) {
  const router = useRouter();
  return (
    <select
      value={selectedDate}
      onChange={(e) => router.push(`${basePath}${basePath.includes('?') ? '&' : '?'}date=${e.target.value}`)}
      style={{ padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)', fontSize: '0.9rem' }}
    >
      {availableDates.map((d) => (
        <option key={d.task_date} value={d.task_date}>
          Day {d.day_number} — {d.task_date}{d.task_date === today ? ' (Today)' : ''}
        </option>
      ))}
    </select>
  );
}
