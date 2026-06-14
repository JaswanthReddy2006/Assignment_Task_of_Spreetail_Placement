import React, { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

export default function Import() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setReport(res.data);
    } catch (err) {
      alert('Import failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="mb-4">Import Expenses</h1>
      
      {!report && (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <form onSubmit={handleUpload}>
            <div className="mb-4">
              <label className="text-muted mb-1" style={{ display: 'block' }}>Upload expenses_export.csv</label>
              <input 
                type="file" 
                accept=".csv"
                onChange={(e) => setFile(e.target.files[0])}
                style={{ width: '100%', padding: '1rem', border: '1px dashed var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!file || loading}>
              {loading ? 'Processing...' : 'Run Importer & Clean Data'}
            </button>
          </form>
        </div>
      )}

      {report && (
        <div>
          <div className="card mb-4" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'var(--success)' }}>
            <h3 className="text-success mb-1">Import Successful</h3>
            <p>Processed data and detected {report.anomalies.length} anomalies.</p>
            <button className="btn btn-primary mt-4" onClick={() => navigate('/')}>View Balances</button>
          </div>

          <h2 className="mb-2">Anomaly Report</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Description</th>
                  <th>Anomalies Handled</th>
                </tr>
              </thead>
              <tbody>
                {report.anomalies.map((a, i) => (
                  <tr key={i}>
                    <td>{a.row}</td>
                    <td>{a.description || '-'}</td>
                    <td>
                      <ul style={{ paddingLeft: '1.2rem', color: 'var(--danger)' }}>
                        {a.issues.map((issue, j) => (
                          <li key={j}>{issue}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
