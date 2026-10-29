import { TASK_URGENCIES, DEFAULT_TASK_URGENCY } from '@/lib/taskUrgency';

const pill = (color) => ({
  display: 'inline-block',
  fontSize: '0.65rem',
  fontWeight: '700',
  padding: '0.1rem 0.5rem',
  borderRadius: '1rem',
  marginRight: '0.4rem',
  verticalAlign: 'middle',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  color,
  border: `1px solid ${color}`,
  whiteSpace: 'nowrap',
});

// "Default" tag for tasks that came from a default (recurring/onboarding) task,
// plus the task's urgency.
export default function TaskBadges({ urgency, isDefault }) {
  const u = TASK_URGENCIES.find((x) => x.value === urgency) || TASK_URGENCIES.find((x) => x.value === DEFAULT_TASK_URGENCY);
  return (
    <>
      {isDefault && <span style={pill('var(--primary)')}>Default</span>}
      <span style={pill(u.color)}>{u.label}</span>
    </>
  );
}
