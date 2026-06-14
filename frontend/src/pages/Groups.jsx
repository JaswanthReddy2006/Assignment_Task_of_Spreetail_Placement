import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newMember, setNewMember] = useState('');
  const [joinDate, setJoinDate] = useState('');

  const fetchGroups = async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGroups(); }, []);

  const handleAddMember = async (groupId) => {
    if (!newMember.trim()) return;
    try {
      await api.put(`/groups/${groupId}/members`, {
        user_name: newMember.trim(),
        action: 'add',
        joined_at: joinDate || undefined
      });
      setNewMember('');
      setJoinDate('');
      fetchGroups();
    } catch (err) {
      alert('Failed to add member');
    }
  };

  const handleRemoveMember = async (groupId, memberName) => {
    try {
      await api.put(`/groups/${groupId}/members`, {
        user_name: memberName,
        action: 'remove'
      });
      fetchGroups();
    } catch (err) {
      alert('Failed to remove member');
    }
  };

  if (loading) return <div><p className="text-muted">Loading...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Groups</h1>
      </div>

      {groups.length === 0 ? (
        <div className="card text-center text-muted" style={{ padding: '2rem' }}>
          No groups yet. Import a CSV to create the Flatmates group automatically.
        </div>
      ) : (
        groups.map(group => (
          <div key={group.id} className="card mb-3">
            <div className="flex-between mb-2">
              <h2 className="section-title" style={{ margin: 0 }}>{group.name}</h2>
              <span className="badge badge-info">{group.GroupMembers ? group.GroupMembers.length : 0} members</span>
            </div>

            {/* Members List */}
            <div className="table-wrap mb-2">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Joined</th>
                    <th>Left</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {group.GroupMembers && group.GroupMembers.map((gm, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{gm.User ? gm.User.name : '-'}</td>
                      <td className="text-sm">{gm.joined_at ? new Date(gm.joined_at).toLocaleDateString('en-IN') : '-'}</td>
                      <td className="text-sm">{gm.left_at ? new Date(gm.left_at).toLocaleDateString('en-IN') : '-'}</td>
                      <td>
                        <span className={`badge ${gm.left_at ? 'badge-warning' : 'badge-success'}`}>
                          {gm.left_at ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        {!gm.left_at && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleRemoveMember(group.id, gm.User.name)}
                          >
                            Mark Left
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add Member */}
            <div className="flex gap-1" style={{ alignItems: 'flex-end' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label>Add Member</label>
                <input className="form-input" placeholder="Name" value={newMember} onChange={e => setNewMember(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Joined Date</label>
                <input className="form-input" type="date" value={joinDate} onChange={e => setJoinDate(e.target.value)} />
              </div>
              <button className="btn btn-primary" onClick={() => handleAddMember(group.id)} style={{ height: '38px' }}>Add</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
