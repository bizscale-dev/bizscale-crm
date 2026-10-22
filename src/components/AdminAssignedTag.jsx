// Small tag for a client whose task the admin assigned by hand
// (seo_tasks.admin_label, e.g. "Assigned by admin · Month 1"). When a client
// has such a task it replaces the usual funnel tag on the associate's lists.
export const adminLabelOf = (client) => client.tasks.find((t) => t.admin_label)?.admin_label || null;

export default function AdminAssignedTag({ label }) {
  if (!label) return null;
  return (
    <span style={{
      display: 'inline-block',
      marginLeft: '0.5rem',
      padding: '0.1rem 0.5rem',
      borderRadius: '1rem',
      fontSize: '0.7rem',
      fontWeight: '600',
      color: '#8b5cf6',
      backgroundColor: 'rgba(139, 92, 246, 0.14)',
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
    }}>
      {label}
    </span>
  );
}
