import React, { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

export default function Import() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [data, setData] = useState([]);
  const navigate = useNavigate();

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post('/import-analyze', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAnalysis(res.data.anomalies);
      setData(res.data.data);
    } catch (err) {
      alert('Analysis failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRowChange = (index, field, value) => {
    const newData = [...data];
    newData[index][field] = value;
    setData(newData);
  };

  const handleDropRow = (index) => {
    const newData = [...data];
    newData[index]._drop = !newData[index]._drop;
    setData(newData);
  };

  const submitCleanData = async () => {
    setLoading(true);
    try {
      await api.post('/import-confirm', { cleanData: data });
      alert('Data imported successfully!');
      navigate('/');
    } catch (err) {
      alert('Failed to save data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!analysis) {
    return (
      <div>
        <h1 className="mb-4">Import Expenses</h1>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <form onSubmit={handleUpload}>
            <div className="mb-4">
              <label className="text-muted mb-1" style={{ display: 'block' }}>Upload expenses_export.csv</label>
              <input 
                type="file" 
                accept=".csv"
                onChange={(e) => setFile(e.target.files[0])}
                style={{ width: '100%', padding: '1rem', border: '1px dashed var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', color: 'white' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!file || loading}>
              {loading ? 'Analyzing...' : 'Analyze CSV'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Resolve Anomalies</h1>
        <button className="btn btn-primary" onClick={submitCleanData} disabled={loading}>
          {loading ? 'Saving...' : 'Submit Clean Data'}
        </button>
      </div>

      <div className="card mb-4" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'var(--danger)' }}>
        <h3 className="text-danger mb-1">{analysis.length} Rows Require Attention</h3>
        <p>Please review the highlighted rows below. You can edit any field directly or mark a row to be dropped.</p>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Date</th>
              <th>Description</th>
              <th>Paid By</th>
              <th>Amount</th>
              <th>Currency</th>
              <th>Split Type</th>
              <th>Split Details</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const rowAnomaly = analysis.find(a => a.rowNum === row._rowNum);
              const isDropped = row._drop;
              const rowStyle = isDropped ? { opacity: 0.5, textDecoration: 'line-through' } : {};
              const anomalyBg = rowAnomaly && !isDropped ? { backgroundColor: 'rgba(239, 68, 68, 0.15)' } : {};

              return (
                <React.Fragment key={i}>
                  <tr style={{ ...rowStyle, ...anomalyBg }}>
                    <td>{row._rowNum}</td>
                    <td>
                      <input type="text" value={row.date || ''} onChange={(e) => handleRowChange(i, 'date', e.target.value)} style={{ width: '90px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.description || ''} onChange={(e) => handleRowChange(i, 'description', e.target.value)} style={{ width: '150px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.paid_by || ''} onChange={(e) => handleRowChange(i, 'paid_by', e.target.value)} style={{ width: '80px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.amount || ''} onChange={(e) => handleRowChange(i, 'amount', e.target.value)} style={{ width: '60px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.currency || ''} onChange={(e) => handleRowChange(i, 'currency', e.target.value)} style={{ width: '50px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.split_type || ''} onChange={(e) => handleRowChange(i, 'split_type', e.target.value)} style={{ width: '80px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <input type="text" value={row.split_details || ''} onChange={(e) => handleRowChange(i, 'split_details', e.target.value)} style={{ width: '150px' }} disabled={isDropped}/>
                    </td>
                    <td>
                      <button onClick={() => handleDropRow(i)} className="btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', backgroundColor: isDropped ? 'var(--success)' : 'var(--danger)', color: 'white' }}>
                        {isDropped ? 'Restore' : 'Drop'}
                      </button>
                    </td>
                  </tr>
                  {rowAnomaly && !isDropped && (
                    <tr style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                      <td colSpan="9" style={{ padding: '0.5rem 1rem' }}>
                        <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
                          <strong>Issues:</strong> {rowAnomaly.issues.join(' | ')}
                          <br />
                          <strong>Required Fixes:</strong> {Object.values(rowAnomaly.requiredFixes).join(' ')}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
