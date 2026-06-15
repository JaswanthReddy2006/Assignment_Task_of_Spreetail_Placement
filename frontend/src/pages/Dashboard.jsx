import React, { useEffect, useState, useContext } from 'react';
import api from '../api';
import { UserContext } from '../App';

export default function Dashboard() {
  const { user } = useContext(UserContext);
  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedExp, setExpandedExp] = useState(null);
  const [showSettle, setShowSettle] = useState(false);
  const [settleForm, setSettleForm] = useState({ from_name: '', to_name: '', amount: '' });

  const fetchData = async () => {
    try {
      const [balRes, debtRes, expRes] = await Promise.all([
        api.get('/balances'),
        api.get('/debts'),
        api.get('/expenses')
      ]);
      setBalances(balRes.data);
      setDebts(debtRes.data);
      setExpenses(expRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSettle = async () => {
    try {
      await api.post('/settlements', settleForm);
      setShowSettle(false);
      setSettleForm({ from_name: '', to_name: '', amount: '' });
      setLoading(true);
      fetchData();
    } catch (err) {
      alert('Settlement failed');
    }
  };

  const handleFromChange = (from_name) => {
    const to_name = settleForm.to_name;
    let amount = '';
    if (from_name && to_name) {
      const match = debts.find(d => d.from === from_name && d.to === to_name);
      amount = match ? match.amount.toString() : '0';
    }
    setSettleForm(prev => ({ ...prev, from_name, amount }));
  };

  const handleToChange = (to_name) => {
    const from_name = settleForm.from_name;
    let amount = '';
    if (from_name && to_name) {
      const match = debts.find(d => d.from === from_name && d.to === to_name);
      amount = match ? match.amount.toString() : '0';
    }
    setSettleForm(prev => ({ ...prev, to_name, amount }));
  };

  if (loading) return <div className="main-content"><p className="text-muted">Loading...</p></div>;

  const myBalance = balances.find(b => b.name === user);

  const owingAmount = (() => {
    if (!settleForm.from_name || !settleForm.to_name) return 0;
    const match = debts.find(d => d.from === settleForm.from_name && d.to === settleForm.to_name);
    return match ? match.amount : 0;
  })();

  const parsedAmount = parseFloat(settleForm.amount) || 0;
  const isInvalidAmount = !settleForm.from_name || !settleForm.to_name || parsedAmount <= 0 || parsedAmount > owingAmount;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <button className="btn btn-primary" onClick={() => setShowSettle(true)}>Settle Up</button>
      </div>

      {/* Personal Summary */}
      {myBalance && (
        <div className="card mb-3" style={{ borderLeft: `3px solid ${myBalance.balance >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
          <div className="flex-between mb-2">
            <div>
              <div className="text-muted text-sm">Your Net Balance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: myBalance.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                ₹{Math.abs(myBalance.balance).toFixed(2)}
              </div>
            </div>
            <div className="text-muted text-sm" style={{ fontWeight: 600, color: myBalance.balance >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {myBalance.balance > 0 ? 'You are owed overall' : myBalance.balance < 0 ? 'You owe overall' : 'All settled!'}
            </div>
          </div>

          {/* Personal breakdown of who pays whom */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '10px', marginTop: '10px' }}>
            <div className="text-muted text-xs mb-2" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Settlements</div>
            
            {debts.filter(d => d.from === user).length === 0 && debts.filter(d => d.to === user).length === 0 ? (
              <div className="text-sm text-muted" style={{ fontStyle: 'italic', padding: '4px 0' }}>
                No pending payments or collections.
              </div>
            ) : (
              <>
                {/* Who you owe */}
                {debts.filter(d => d.from === user).map((d, idx) => (
                  <div key={`owe-${idx}`} className="flex-between text-sm" style={{ padding: '4px 0' }}>
                    <span>You owe <strong style={{ color: 'var(--text)' }}>{d.to}</strong></span>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>₹{d.amount}</span>
                  </div>
                ))}
                
                {/* Who owes you */}
                {debts.filter(d => d.to === user).map((d, idx) => (
                  <div key={`owed-${idx}`} className="flex-between text-sm" style={{ padding: '4px 0' }}>
                    <span><strong style={{ color: 'var(--text)' }}>{d.from}</strong> owes you</span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>₹{d.amount}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* All Balances */}
      <h2 className="section-title">Group Balances</h2>
      <div className="grid-3 mb-3">
        {balances.map(b => (
          <div className="card balance-card" key={b.id}>
            <div className="name">{b.name}</div>
            <div className="amount" style={{ color: b.balance > 0 ? 'var(--success)' : b.balance < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
              ₹{Math.abs(b.balance).toFixed(2)}
            </div>
            <div className="status">{b.balance > 0 ? 'gets back' : b.balance < 0 ? 'owes' : 'settled'}</div>
          </div>
        ))}
      </div>

      {/* Simplified Debts */}
      <h2 className="section-title">Who Pays Whom</h2>
      {debts.length === 0 ? (
        <div className="card-flat text-center text-muted mb-3" style={{ padding: '2rem' }}>Everyone is settled up! 🎉</div>
      ) : (
        <div className="card-flat mb-3" style={{ padding: 0, overflow: 'hidden' }}>
          {debts.map((d, i) => (
            <div className="debt-item" key={i}>
              <div className="debt-flow">
                <span className="debt-name from">{d.from}</span>
                <span className="debt-arrow">→</span>
                <span className="debt-name to">{d.to}</span>
              </div>
              <div className="debt-amount">₹{d.amount}</div>
            </div>
          ))}
        </div>
      )}

      {/* Expense History */}
      <h2 className="section-title">Expense History</h2>
      {expenses.length === 0 ? (
        <div className="card-flat text-center text-muted" style={{ padding: '2rem' }}>No expenses yet. Import a CSV or add one manually.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Paid By</th>
                <th>Amount</th>
                <th>Split</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <React.Fragment key={exp.id}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedExp(expandedExp === exp.id ? null : exp.id)}>
                    <td>{exp.date ? new Date(exp.date).toLocaleDateString('en-IN') : '-'}</td>
                    <td style={{ fontWeight: 500 }}>{exp.description}</td>
                    <td>{exp.Payer ? exp.Payer.name : '-'}</td>
                    <td style={{ fontWeight: 600 }}>₹{parseFloat(exp.amount).toFixed(2)}</td>
                    <td><span className="badge badge-info">{exp.split_type}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>{expandedExp === exp.id ? '▲' : '▼'}</td>
                  </tr>
                  {expandedExp === exp.id && exp.ExpenseSplits && (
                    <tr>
                      <td colSpan="6" style={{ background: 'rgba(255,255,255,0.02)', padding: '0.5rem 1rem' }}>
                        <div className="text-sm text-muted mb-1" style={{ fontWeight: 600 }}>Split Breakdown:</div>
                        {exp.ExpenseSplits.map((s, j) => (
                          <div key={j} className="flex-between text-sm" style={{ padding: '0.2rem 0' }}>
                            <span>{s.User ? s.User.name : `User #${s.user_id}`}</span>
                            <span style={{ fontWeight: 600 }}>₹{parseFloat(s.allocated_amount).toFixed(2)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Settle Modal */}
      {showSettle && (
        <div className="modal-overlay" onClick={() => setShowSettle(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Record Settlement</h2>
            <div className="form-group">
              <label>Who is paying?</label>
              <select className="form-select" value={settleForm.from_name} onChange={e => handleFromChange(e.target.value)}>
                <option value="">Select</option>
                {balances.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Paying to?</label>
              <select className="form-select" value={settleForm.to_name} onChange={e => handleToChange(e.target.value)}>
                <option value="">Select</option>
                {balances.filter(b => b.name !== settleForm.from_name).map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>

            {settleForm.from_name && settleForm.to_name && (
              <div style={{ fontSize: '0.85rem', marginBottom: '15px', padding: '8px 10px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: owingAmount > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {owingAmount > 0 ? (
                  <span><strong>{settleForm.from_name}</strong> owes <strong>{settleForm.to_name}</strong> a maximum of <strong>₹{owingAmount.toFixed(2)}</strong>.</span>
                ) : (
                  <span><strong>{settleForm.from_name}</strong> does not owe <strong>{settleForm.to_name}</strong> any money under simplified debts.</span>
                )}
              </div>
            )}

            <div className="form-group">
              <label>Amount (₹)</label>
              <input 
                className="form-input" 
                type="number" 
                placeholder="0.00" 
                value={settleForm.amount} 
                onChange={e => setSettleForm(prev => ({ ...prev, amount: e.target.value }))}
                max={owingAmount}
              />
              {parsedAmount > owingAmount && owingAmount > 0 && (
                <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: '4px' }}>
                  Amount cannot exceed the owing limit of ₹{owingAmount.toFixed(2)}.
                </div>
              )}
            </div>
            <div className="flex gap-1">
              <button 
                className="btn btn-primary" 
                onClick={handleSettle} 
                disabled={isInvalidAmount}
              >
                Record Payment
              </button>
              <button className="btn btn-outline" onClick={() => setShowSettle(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
