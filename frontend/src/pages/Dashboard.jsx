import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Dashboard() {
  const [balances, setBalances] = useState([]);
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [balRes, debtRes] = await Promise.all([
          api.get('/balances'),
          api.get('/debts')
        ]);
        setBalances(balRes.data);
        setDebts(debtRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h1 className="mb-4">Group Balances</h1>
      <div className="grid-3 mb-4">
        {balances.map(b => (
          <div className="card" key={b.id}>
            <h3>{b.name}</h3>
            <h2 className={b.balance > 0 ? 'text-success' : b.balance < 0 ? 'text-danger' : ''} style={{marginTop: '0.5rem'}}>
              ₹{b.balance.toFixed(2)}
            </h2>
            <p className="text-muted text-sm">{b.balance > 0 ? 'gets back' : b.balance < 0 ? 'owes' : 'settled up'}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-4">Simplified Debts</h2>
      {debts.length === 0 ? (
        <div className="card text-center text-muted">Everyone is settled up!</div>
      ) : (
        <div className="grid-2">
          {debts.map((d, i) => (
            <div className="card" key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--danger)' }}>{d.from}</span>
                <span style={{ margin: '0 10px', color: 'var(--text-muted)' }}>owes</span>
                <span className="badge" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: 'var(--success)' }}>{d.to}</span>
              </div>
              <div style={{ fontWeight: 'bold' }}>₹{d.amount}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
