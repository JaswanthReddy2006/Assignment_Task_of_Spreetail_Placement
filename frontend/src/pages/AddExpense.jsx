import React, { useState, useEffect, useContext } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';

export default function AddExpense() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    description: '',
    amount: '',
    currency: 'INR',
    paid_by: user || '',
    split_type: 'equal',
    split_with: '',
    split_details: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/users').then(res => setUsers(res.data)).catch(() => {});
  }, []);

  const handleChange = (field, value) => {
    setForm({ ...form, [field]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.paid_by || !form.split_with) {
      alert('Please fill in all required fields');
      return;
    }
    setLoading(true);
    try {
      await api.post('/expenses', form);
      navigate('/');
    } catch (err) {
      alert('Failed to create expense');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const needsDetails = form.split_type !== 'equal';

  return (
    <div>
      <div className="page-header">
        <h1>Add Expense</h1>
      </div>

      <div style={{ maxWidth: '550px' }}>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Description *</label>
              <input className="form-input" placeholder="e.g. Grocery Shopping" value={form.description} onChange={e => handleChange('description', e.target.value)} />
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Amount *</label>
                <input className="form-input" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => handleChange('amount', e.target.value)} />
              </div>
              <div className="form-group">
                <label>Currency</label>
                <select className="form-select" value={form.currency} onChange={e => handleChange('currency', e.target.value)}>
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>

            <div className="grid-2">
              <div className="form-group">
                <label>Paid By *</label>
                <select className="form-select" value={form.paid_by} onChange={e => handleChange('paid_by', e.target.value)}>
                  <option value="">Select</option>
                  {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  {users.length === 0 && <option value={user}>{user}</option>}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input className="form-input" type="date" value={form.date} onChange={e => handleChange('date', e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label>Split Type *</label>
              <select className="form-select" value={form.split_type} onChange={e => handleChange('split_type', e.target.value)}>
                <option value="equal">Equal</option>
                <option value="unequal">Unequal</option>
                <option value="percentage">Percentage</option>
                <option value="share">Share</option>
              </select>
            </div>

            <div className="form-group">
              <label>Split With * <span className="text-muted text-sm">(semicolon-separated names)</span></label>
              <input className="form-input" placeholder="Aisha;Rohan;Priya" value={form.split_with} onChange={e => handleChange('split_with', e.target.value)} />
            </div>

            {/* Split Details — only when NOT equal */}
            {needsDetails && (
              <div className="form-group">
                <label>
                  Split Details *
                  <span className="text-muted text-sm">
                    {form.split_type === 'unequal' && ' (e.g. Aisha 500;Rohan 300)'}
                    {form.split_type === 'percentage' && ' (e.g. Aisha 60%;Rohan 40%)'}
                    {form.split_type === 'share' && ' (e.g. Aisha 2;Rohan 1)'}
                  </span>
                </label>
                <input className="form-input" placeholder="Name value;Name value" value={form.split_details} onChange={e => handleChange('split_details', e.target.value)} />
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? 'Creating...' : 'Add Expense'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
