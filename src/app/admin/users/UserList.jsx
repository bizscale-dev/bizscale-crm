'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import UserForm from './UserForm';
import { deleteUser, assignAssociate, assignWriter, unassignUser } from './actions';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

export default function UserList({ users, assignedAssociates, assignedWriters, hasActiveCampaign }) {
  const [editingId, setEditingId] = useState(null);
  const router = useRouter();

  if (users.length === 0) {
    return <EmptyState message="No users found." />;
  }

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        const result = await deleteUser(id);
        if (result.success) {
          router.refresh();
        } else {
          alert(result.error || 'Failed to delete user');
        }
      } catch (error) {
        alert('Error deleting user: ' + error.message);
      }
    }
  };

  const handleUnassign = async (id) => {
    try {
      const result = await unassignUser(id);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || 'Failed to unassign user');
      }
    } catch (error) {
      alert('Error unassigning user: ' + error.message);
    }
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <th style={{ padding: '1rem 0' }}>Name</th>
            <th style={{ padding: '1rem 0' }}>Email</th>
            <th style={{ padding: '1rem 0' }}>Role</th>
            <th style={{ padding: '1rem 0' }}>Status</th>
            <th style={{ padding: '1rem 0' }}>Campaign Assignment</th>
            <th style={{ padding: '1rem 0' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            const isAssignedAssoc = assignedAssociates.includes(u.id);
            const isAssignedWriter = assignedWriters.includes(u.id);
            const isAssigned = isAssignedAssoc || isAssignedWriter;

            return (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '1rem 0', fontWeight: '500' }}>{u.name}</td>
                <td style={{ padding: '1rem 0', color: 'var(--text-muted)' }}>{u.email}</td>
                <td style={{ padding: '1rem 0' }}>
                  <RoleBadge role={u.role} />
                </td>
                <td style={{ padding: '1rem 0' }}>
                  <Badge tone={u.is_active ? 'success' : 'danger'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                </td>
                <td style={{ padding: '1rem 0' }}>
                  {!hasActiveCampaign && <span style={{ color: 'var(--text-muted)' }}>No Active Campaign</span>}
                  {hasActiveCampaign && u.role === 'admin' && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  {hasActiveCampaign && u.role === 'manager' && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  
                  {hasActiveCampaign && (u.role === 'seo_associate' || u.role === 'writer') && (
                    isAssigned ? (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ color: 'var(--success)', fontSize: '0.875rem' }}>Assigned</span>
                        <button onClick={() => handleUnassign(u.id)} className="btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                          Unassign
                        </button>
                      </div>
                    ) : (
                      <form action={u.role === 'seo_associate' ? assignAssociate : assignWriter} style={{ display: 'flex', gap: '0.5rem' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <button type="submit" className="btn" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--primary)', color: 'white' }}>
                          Assign
                        </button>
                      </form>
                    )
                  )}
                </td>
                <td style={{ padding: '1rem 0' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => setEditingId(u.id)}
                      className="btn" 
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'transparent', border: '1px solid var(--border)', color: 'var(--foreground)' }}>
                      Edit
                    </button>
                    {u.role !== 'admin' && (
                      <button 
                        onClick={() => handleDelete(u.id)}
                        className="btn" 
                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none' }}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editingId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Edit User</h3>
              <button onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem' }}>&times;</button>
            </div>
            <UserForm 
              mode="edit" 
              initialData={users.find(u => u.id === editingId)} 
              onSuccess={() => setEditingId(null)} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const map = {
    admin: { label: 'Admin', tone: 'danger' },
    manager: { label: 'Manager', tone: 'warning' },
    seo_associate: { label: 'SEO Associate', tone: 'brand' },
    web_seo_associate: { label: 'Web SEO Associate', tone: 'neutral' },
    writer: { label: 'Writer', tone: 'success' },
  };
  const config = map[role] || { label: role, tone: 'neutral' };

  return <Badge tone={config.tone}>{config.label}</Badge>;
}
