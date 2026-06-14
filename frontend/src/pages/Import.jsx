import React, { useState } from 'react';
import api from '../api';
import { useNavigate } from 'react-router-dom';

export default function Import() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [data, setData] = useState([]);
  const [importReport, setImportReport] = useState(null);
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
      // Build import report
      const report = buildImportReport();
      setImportReport(report);
    } catch (err) {
      alert('Failed to save data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const buildImportReport = () => {
    const rows = [];
    data.forEach((row) => {
      const rowAnomaly = analysis.find(a => a.rowNum === row._rowNum);
      if (rowAnomaly) {
        rows.push({
          rowNum: row._rowNum,
          description: row.description,
          action: row._drop ? 'DROPPED' : 'FIXED BY USER',
          issues: rowAnomaly.issues
        });
      }
    });
    return {
      totalRows: data.length,
      anomalyCount: analysis.length,
      droppedCount: data.filter(r => r._drop).length,
      importedCount: data.filter(r => !r._drop).length,
      details: rows
    };
  };

  // Helper: check if a field has an issue for this row
  const getFieldIssue = (rowAnomaly, field) => {
    if (!rowAnomaly || !rowAnomaly.requiredFixes) return null;
    return rowAnomaly.requiredFixes[field] || null;
  };

  // Helper: check if split_details is needed based on split_type
  const needsSplitDetails = (splitType) => {
    if (!splitType) return false;
    const lower = splitType.toLowerCase().trim();
    return lower !== 'equal' && lower !== '';
  };

  // ===== Import Report View =====
  if (importReport) {
    return (
      <div>
        <div className="page-header">
          <h1>Import Report</h1>
          <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Dashboard</button>
        </div>

        <div className="stats-bar">
          <div className="stat-item">
            <span className="stat-num">{importReport.totalRows}</span>
            <span className="stat-label">Total Rows</span>
          </div>
          <div className="stat-item">
            <span className="stat-num text-danger">{importReport.anomalyCount}</span>
            <span className="stat-label">Anomalies Found</span>
          </div>
          <div className="stat-item">
            <span className="stat-num text-success">{importReport.importedCount}</span>
            <span className="stat-label">Imported</span>
          </div>
          <div className="stat-item">
            <span className="stat-num text-warning">{importReport.droppedCount}</span>
            <span className="stat-label">Dropped</span>
          </div>
        </div>

        <h2 className="section-title">Anomaly Details</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Description</th>
                <th>Issues Detected</th>
                <th>Action Taken</th>
              </tr>
            </thead>
            <tbody>
              {importReport.details.map((r, i) => (
                <tr key={i}>
                  <td>{r.rowNum}</td>
                  <td>{r.description}</td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {r.issues.map((issue, j) => (
                        <span key={j} className="badge badge-danger">{issue}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${r.action === 'DROPPED' ? 'badge-warning' : 'badge-success'}`}>
                      {r.action}
                    </span>
                  </td>
                </tr>
              ))}
              {importReport.details.length === 0 && (
                <tr><td colSpan="4" className="text-center text-muted">No anomalies detected — clean import!</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ===== Upload View =====
  if (!analysis) {
    return (
      <div>
        <div className="page-header">
          <h1>Import Expenses</h1>
        </div>
        <div style={{ maxWidth: '500px' }}>
          <div className="card">
            <form onSubmit={handleUpload}>
              <div
                className="upload-zone mb-2"
                onClick={() => document.getElementById('csv-input').click()}
              >
                <div className="icon">📄</div>
                {file ? (
                  <p className="filename">{file.name}</p>
                ) : (
                  <p>Click to select <strong>expenses_export.csv</strong></p>
                )}
                <input
                  id="csv-input"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFile(e.target.files[0])}
                  style={{ display: 'none' }}
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={!file || loading}>
                {loading ? 'Analyzing...' : 'Analyze CSV'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ===== Anomaly Resolution View =====
  const anomalyRows = data.filter((row) => analysis.find(a => a.rowNum === row._rowNum));
  const cleanRows = data.filter((row) => !analysis.find(a => a.rowNum === row._rowNum));

  return (
    <div>
      <div className="page-header">
        <h1>Resolve Anomalies</h1>
        <div className="flex gap-1">
          <button className="btn btn-outline" onClick={() => { setAnalysis(null); setData([]); setFile(null); }}>
            Re-upload
          </button>
          <button className="btn btn-primary" onClick={submitCleanData} disabled={loading}>
            {loading ? 'Importing...' : `Import ${data.filter(r => !r._drop).length} Rows`}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-bar mb-3">
        <div className="stat-item">
          <span className="stat-num">{data.length}</span>
          <span className="stat-label">Total Rows</span>
        </div>
        <div className="stat-item">
          <span className="stat-num text-danger">{anomalyRows.length}</span>
          <span className="stat-label">Need Attention</span>
        </div>
        <div className="stat-item">
          <span className="stat-num text-success">{cleanRows.length}</span>
          <span className="stat-label">Clean</span>
        </div>
      </div>

      {/* Anomaly Rows */}
      {data.map((row, i) => {
        const rowAnomaly = analysis.find(a => a.rowNum === row._rowNum);
        const isDropped = row._drop;
        const hasIssues = !!rowAnomaly;

        // Determine card class
        let cardClass = 'anomaly-card';
        if (isDropped) cardClass += ' is-dropped';
        else if (hasIssues) cardClass += ' has-issues';
        else cardClass += ' is-clean';

        // Only show clean rows as a collapsed summary, not individual cards
        if (!hasIssues) return null;

        return (
          <div key={i} className={cardClass}>
            {/* Header */}
            <div className="row-header">
              <div className="flex gap-1" style={{ alignItems: 'center' }}>
                <span className="row-num">Row {row._rowNum}</span>
                <span className="text-muted text-sm">— {row.description || 'No description'}</span>
              </div>
              <button
                className={`btn btn-sm ${isDropped ? 'btn-success' : 'btn-danger'}`}
                onClick={() => handleDropRow(i)}
              >
                {isDropped ? 'Restore' : 'Drop Row'}
              </button>
            </div>

            {/* Issue Tags */}
            {rowAnomaly && !isDropped && (
              <div className="issues-list">
                {rowAnomaly.issues.map((issue, j) => (
                  <span key={j} className="issue-tag">{issue}</span>
                ))}
              </div>
            )}

            {/* Editable Fields */}
            {!isDropped && (
              <div className="fields-grid">
                {/* Date */}
                <div className="field-group">
                  <label>Date</label>
                  <input
                    className={`form-input${getFieldIssue(rowAnomaly, 'date') ? ' input-error' : ''}`}
                    value={row.date || ''}
                    onChange={(e) => handleRowChange(i, 'date', e.target.value)}
                    placeholder="DD-MM-YYYY"
                  />
                  {getFieldIssue(rowAnomaly, 'date') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'date')}</div>}
                </div>

                {/* Description */}
                <div className="field-group">
                  <label>Description</label>
                  <input
                    className="form-input"
                    value={row.description || ''}
                    onChange={(e) => handleRowChange(i, 'description', e.target.value)}
                  />
                </div>

                {/* Paid By */}
                <div className="field-group">
                  <label>Paid By</label>
                  <input
                    className={`form-input${getFieldIssue(rowAnomaly, 'paid_by') ? ' input-error' : ''}`}
                    value={row.paid_by || ''}
                    onChange={(e) => handleRowChange(i, 'paid_by', e.target.value)}
                    placeholder="Name"
                  />
                  {getFieldIssue(rowAnomaly, 'paid_by') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'paid_by')}</div>}
                </div>

                {/* Amount */}
                <div className="field-group">
                  <label>Amount</label>
                  <input
                    className={`form-input${getFieldIssue(rowAnomaly, 'amount') ? ' input-error' : ''}`}
                    value={row.amount || ''}
                    onChange={(e) => handleRowChange(i, 'amount', e.target.value)}
                    placeholder="0.00"
                  />
                  {getFieldIssue(rowAnomaly, 'amount') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'amount')}</div>}
                </div>

                {/* Currency */}
                <div className="field-group">
                  <label>Currency</label>
                  <select
                    className={`form-select${getFieldIssue(rowAnomaly, 'currency') ? ' input-error' : ''}`}
                    value={row.currency || 'INR'}
                    onChange={(e) => handleRowChange(i, 'currency', e.target.value)}
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                  {getFieldIssue(rowAnomaly, 'currency') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'currency')}</div>}
                </div>

                {/* Split Type */}
                <div className="field-group">
                  <label>Split Type</label>
                  <select
                    className={`form-select${getFieldIssue(rowAnomaly, 'split_type') ? ' input-error' : ''}`}
                    value={row.split_type || ''}
                    onChange={(e) => handleRowChange(i, 'split_type', e.target.value)}
                  >
                    <option value="">— select —</option>
                    <option value="equal">Equal</option>
                    <option value="unequal">Unequal</option>
                    <option value="percentage">Percentage</option>
                    <option value="share">Share</option>
                  </select>
                  {getFieldIssue(rowAnomaly, 'split_type') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'split_type')}</div>}
                </div>

                {/* Split With */}
                <div className="field-group">
                  <label>Split With</label>
                  <input
                    className={`form-input${getFieldIssue(rowAnomaly, 'split_with') ? ' input-error' : ''}`}
                    value={row.split_with || ''}
                    onChange={(e) => handleRowChange(i, 'split_with', e.target.value)}
                    placeholder="Name1;Name2"
                  />
                  {getFieldIssue(rowAnomaly, 'split_with') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'split_with')}</div>}
                </div>

                {/* Split Details — ONLY shown when split_type is NOT equal */}
                {needsSplitDetails(row.split_type) && (
                  <div className="field-group">
                    <label>Split Details</label>
                    <input
                      className={`form-input${getFieldIssue(rowAnomaly, 'split_details') ? ' input-error' : ''}`}
                      value={row.split_details || ''}
                      onChange={(e) => handleRowChange(i, 'split_details', e.target.value)}
                      placeholder="Name1 50%;Name2 50%"
                    />
                    {getFieldIssue(rowAnomaly, 'split_details') && <div className="field-hint">{getFieldIssue(rowAnomaly, 'split_details')}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Clean rows summary */}
      {cleanRows.length > 0 && (
        <div className="card-flat text-center text-muted mt-2" style={{ padding: '1rem' }}>
          ✅ {cleanRows.length} rows are clean and ready to import
        </div>
      )}
    </div>
  );
}
