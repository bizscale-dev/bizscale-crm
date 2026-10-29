// Urgency a task can be assigned with (admin -> manager and manager -> associate).
// Anything missing or unrecognised counts as the default, 'moderate'.
export const TASK_URGENCIES = [
  { value: 'low', label: 'Low', color: '#16b293' },
  { value: 'moderate', label: 'Moderate', color: '#f59e0b' },
  { value: 'urgent', label: 'Urgent', color: '#dc2626' },
];

export const DEFAULT_TASK_URGENCY = 'moderate';

export function parseUrgency(v) {
  const s = String(v || '').trim().toLowerCase();
  return TASK_URGENCIES.some((u) => u.value === s) ? s : DEFAULT_TASK_URGENCY;
}
