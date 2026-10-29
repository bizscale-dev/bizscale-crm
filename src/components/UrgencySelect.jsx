'use client';

import { TASK_URGENCIES } from '@/lib/taskUrgency';

// Urgency picker for the "assign a task" forms. Moderate unless changed.
export default function UrgencySelect({ value, onChange, labelStyle, inputStyle }) {
  return (
    <div>
      <label style={labelStyle}>Urgency</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        {TASK_URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
    </div>
  );
}
