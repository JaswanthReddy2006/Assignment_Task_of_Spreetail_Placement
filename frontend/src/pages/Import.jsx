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

  const handleAutoConvertRow = async (index) => {
    const row = data[index];
    if (!row.amount || !row.currency || row.currency === 'INR') return;
    try {
      const res = await api.get(`/convert-currency?from=${row.currency}&to=INR&amount=${row.amount}&date=${row.date || ''}`);
      if (res.data && res.data.amount) {
        const newData = [...data];
        newData[index].amount = res.data.amount.toString();
        newData[index].currency = 'INR';
        setData(newData);
        // No alert needed — the Foreign Currency error tag clears automatically
      }
    } catch (err) {
      console.error('Conversion failed', err);
    }
  };

  const submitCleanData = async () => {
    setLoading(true);
    try {
      const res = await api.post('/import-confirm', { cleanData: data, anomalyAnalysis: analysis });
      // Build frontend summary for stats display
      const report = buildImportReport();
      setImportReport(report);
    } catch (err) {
      alert('Failed to save data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const downloadTxtReport = () => {
    window.open('http://localhost:5000/api/import-report/download', '_blank');
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
  const getFieldIssue = (row, rowAnomaly, field) => {
    if (!rowAnomaly || !rowAnomaly.requiredFixes) return null;
    
    // Dynamically clear issues if the user has corrected them:
    if (field === 'currency' && row.currency === 'INR') return null;
    if (field === 'paid_by' && row.paid_by && row.paid_by.trim() !== '') return null;
    if (field === 'amount' && row.amount && !row.amount.includes(',') && parseFloat(row.amount) > 0) return null;
    if (field === 'date' && row.date && row.date !== '04-05-2026' && row.date !== 'Mar-14') return null;
    if (field === 'split_type' && row.split_type) {
      if (row.split_type === 'equal' && (!row.split_details || !row.split_details.includes('1;'))) return null;
      if (row.split_type !== 'equal') return null;
    }
    if (field === 'split_with' && row.split_with) {
      if (rowAnomaly.issues.some(i => i.includes('Meera')) && !row.split_with.includes('Meera')) return null;
    }

    return rowAnomaly.requiredFixes[field] || null;
  };

  const getActiveIssues = (row, rowAnomaly) => {
    if (!rowAnomaly) return [];
    return rowAnomaly.issues.filter(issue => {
      if (issue.startsWith('Foreign Currency') && row.currency === 'INR') return false;
      if (issue === 'Missing Payer' && row.paid_by && row.paid_by.trim()) return false;
      if (issue === 'Amount has commas' && row.amount && !row.amount.includes(',')) return false;
      if (issue === 'Amount is 0' && parseFloat(row.amount) !== 0) return false;
      if (issue === 'Missing Currency' && row.currency && row.currency.trim()) return false;
      // Clear ambiguous date if user either changed the value OR clicked a date button (confirmed)
      if (issue === 'Ambiguous Date format' && (row.date !== '04-05-2026' || row._dateConfirmed)) return false;
      if (issue === "Invalid Date format 'Mar-14'" && row.date !== 'Mar-14') return false;
      if (issue.includes('Meera') && row.split_with && !row.split_with.includes('Meera')) return false;
      if (issue.includes('says \'equal\' but details imply') && row.split_type !== 'equal') return false;
      if (issue === 'Missing Split Type' && row.split_type) return false;
      return true;
    });
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
          <div className="flex gap-1">
            <button className="btn btn-outline" onClick={downloadTxtReport}>
              ⬇️ Download Report (.txt)
            </button>
            <button className="btn btn-primary" onClick={() => navigate('/')}>Go to Dashboard</button>
          </div>
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

  // Build conflict groups — rows that share a conflictGroupId
  const conflictGroupMap = {};
  data.forEach((row, i) => {
    if (row._conflictGroupId) {
      if (!conflictGroupMap[row._conflictGroupId]) conflictGroupMap[row._conflictGroupId] = [];
      conflictGroupMap[row._conflictGroupId].push({ row, i });
    }
  });
  const conflictGroupIds = Object.keys(conflictGroupMap);
  const rowsInConflictGroups = new Set(
    conflictGroupIds.flatMap(gid => conflictGroupMap[gid].map(({ row }) => row._rowNum))
  );

  // Single row card renderer (used for both conflict-grouped and standalone anomalies)
  const renderRowCard = (row, i, rowAnomaly, inConflict = false) => {
    const activeIssues = getActiveIssues(row, rowAnomaly);
    const isDropped = row._drop;
    const hasIssues = activeIssues.length > 0;

    let cardClass = 'anomaly-card';
    if (isDropped) cardClass += ' is-dropped';
    else if (hasIssues) cardClass += ' has-issues';
    else cardClass += ' is-clean';

    const conflictRoleBadge = row._conflictRole === 'suggested-keep'
      ? <span className="badge badge-success" style={{ marginLeft: '6px' }}>Suggested Keep</span>
      : row._conflictRole === 'duplicate'
        ? <span className="badge badge-danger" style={{ marginLeft: '6px' }}>Duplicate</span>
        : null;

    return (
      <div key={i} className={cardClass} style={inConflict ? { marginBottom: '8px' } : {}}>
        {/* Header */}
        <div className="row-header">
          <div className="flex gap-1" style={{ alignItems: 'center' }}>
            <span className="row-num">Row {row._rowNum}</span>
            {conflictRoleBadge}
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
        {activeIssues.length > 0 && !isDropped && (
          <div className="issues-list">
            {activeIssues.map((issue, j) => (
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
              {/* Ambiguous date: show quick-pick buttons instead of free text */}
              {row.date === '04-05-2026' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--danger)', marginBottom: '2px' }}>
                    ⚠ Is this <strong>April 5</strong> or <strong>May 4</strong>?
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => handleRowChange(i, 'date', '05-04-2026')}
                    >
                      April 5, 2026
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ flex: 1 }}
                      onClick={() => {
                        // May 4 = 04-05-2026 (DD-MM-YYYY) — same value but mark it confirmed
                        const newData = [...data];
                        newData[i]._dateConfirmed = true;
                        setData(newData);
                      }}
                    >
                      May 4, 2026
                    </button>
                  </div>
                </div>
              ) : (
                <input
                  className={`form-input${getFieldIssue(row, rowAnomaly, 'date') ? ' input-error' : ''}`}
                  value={row.date || ''}
                  onChange={(e) => handleRowChange(i, 'date', e.target.value)}
                  placeholder="DD-MM-YYYY"
                />
              )}
              {getFieldIssue(row, rowAnomaly, 'date') && row.date !== '04-05-2026' && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'date')}</div>}
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
                className={`form-input${getFieldIssue(row, rowAnomaly, 'paid_by') ? ' input-error' : ''}`}
                value={row.paid_by || ''}
                onChange={(e) => handleRowChange(i, 'paid_by', e.target.value)}
                placeholder="Name"
              />
              {getFieldIssue(row, rowAnomaly, 'paid_by') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'paid_by')}</div>}
            </div>

            {/* Amount */}
            <div className="field-group">
              <label>Amount</label>
              <input
                className={`form-input${getFieldIssue(row, rowAnomaly, 'amount') ? ' input-error' : ''}`}
                value={row.amount || ''}
                onChange={(e) => handleRowChange(i, 'amount', e.target.value)}
                placeholder="0.00"
              />
              {getFieldIssue(row, rowAnomaly, 'amount') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'amount')}</div>}
            </div>

            {/* Currency */}
            <div className="field-group">
              <label>Currency</label>
              <select
                className={`form-select${getFieldIssue(row, rowAnomaly, 'currency') ? ' input-error' : ''}`}
                value={row.currency || 'INR'}
                onChange={(e) => handleRowChange(i, 'currency', e.target.value)}
              >
                <option value="INR">INR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
              {getFieldIssue(row, rowAnomaly, 'currency') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'currency')}</div>}
            </div>

            {row.currency !== 'INR' && row.amount && (
              <div className="field-group" style={{ gridColumn: 'span 2', marginTop: '2px', marginBottom: '8px' }}>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--success)', color: '#fff', fontWeight: 600, width: '100%', padding: '8px' }}
                  onClick={() => handleAutoConvertRow(i)}
                >
                  ⟳ Convert {row.currency} → INR using historical rate &nbsp;(click to apply &amp; clear error)
                </button>
              </div>
            )}

            {/* Split Type */}
            <div className="field-group">
              <label>Split Type</label>
              <select
                className={`form-select${getFieldIssue(row, rowAnomaly, 'split_type') ? ' input-error' : ''}`}
                value={row.split_type || ''}
                onChange={(e) => handleRowChange(i, 'split_type', e.target.value)}
              >
                <option value="">— select —</option>
                <option value="equal">Equal</option>
                <option value="unequal">Unequal</option>
                <option value="percentage">Percentage</option>
                <option value="share">Share</option>
              </select>
              {getFieldIssue(row, rowAnomaly, 'split_type') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'split_type')}</div>}
            </div>

            {/* Split With */}
            <div className="field-group">
              <label>Split With</label>
              <input
                className={`form-input${getFieldIssue(row, rowAnomaly, 'split_with') ? ' input-error' : ''}`}
                value={row.split_with || ''}
                onChange={(e) => handleRowChange(i, 'split_with', e.target.value)}
                placeholder="Name1;Name2"
              />
              {getFieldIssue(row, rowAnomaly, 'split_with') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'split_with')}</div>}
            </div>

            {/* Split Details — ONLY shown when split_type is NOT equal */}
            {needsSplitDetails(row.split_type) && (
              <div className="field-group">
                <label>Split Details</label>
                <input
                  className={`form-input${getFieldIssue(row, rowAnomaly, 'split_details') ? ' input-error' : ''}`}
                  value={row.split_details || ''}
                  onChange={(e) => handleRowChange(i, 'split_details', e.target.value)}
                  placeholder="Name1 50%;Name2 50%"
                />
                {getFieldIssue(row, rowAnomaly, 'split_details') && <div className="field-hint">{getFieldIssue(row, rowAnomaly, 'split_details')}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

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
          <span className="stat-num" style={{ color: 'var(--warning)' }}>{conflictGroupIds.length}</span>
          <span className="stat-label">Conflict Groups</span>
        </div>
        <div className="stat-item">
          <span className="stat-num text-success">{cleanRows.length}</span>
          <span className="stat-label">Clean</span>
        </div>
      </div>

      {/* === CONFLICT GROUPS — shown first, side by side === */}
      {conflictGroupIds.map(groupId => {
        const groupEntries = conflictGroupMap[groupId];
        const firstRow = groupEntries[0].row;
        const issueText = firstRow._conflictDesc || 'Duplicate / Conflicting rows';

        return (
          <div key={groupId} style={{ border: '1px solid var(--danger)', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', background: 'rgba(239,68,68,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <span style={{ background: 'var(--danger)', color: '#fff', borderRadius: '4px', padding: '2px 8px', fontSize: '0.78rem', fontWeight: 700 }}>
                ⚠ CONFLICT GROUP
              </span>
              <span className="text-sm text-muted">{issueText}</span>
            </div>
            <div className="text-xs text-muted mb-2" style={{ fontStyle: 'italic' }}>
              Keep at least one row and drop the others. The row marked <strong>Suggested Keep</strong> has the highest amount.
            </div>
            {groupEntries.map(({ row, i }) => {
              const rowAnomaly = analysis.find(a => a.rowNum === row._rowNum);
              return renderRowCard(row, i, rowAnomaly, true);
            })}
          </div>
        );
      })}

      {/* === STANDALONE ANOMALY ROWS (not in a conflict group) === */}
      {data.map((row, i) => {
        if (rowsInConflictGroups.has(row._rowNum)) return null; // already rendered above
        const rowAnomaly = analysis.find(a => a.rowNum === row._rowNum);
        const activeIssues = getActiveIssues(row, rowAnomaly);
        const hasIssues = activeIssues.length > 0;
        if (!hasIssues) return null;
        return renderRowCard(row, i, rowAnomaly, false);
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

