import { useState } from 'react';
import api from '../../api/axios';

async function downloadBlob(path, fallbackFilename) {
  const res = await api.get(path, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackFilename;

  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export default function ExportReportsCard() {
  const [state, setState] = useState({ pdf: 'idle', excel: 'idle' }); // idle | loading | success | error
  const [error, setError] = useState('');

  const handleExport = async (kind) => {
    setState((s) => ({ ...s, [kind]: 'loading' }));
    setError('');
    try {
      const path = kind === 'pdf' ? '/reports/export/pdf' : '/reports/export/excel';
      const fallback = kind === 'pdf' ? 'skin-intelligence-report.pdf' : 'skin-intelligence-report.xlsx';
      await downloadBlob(path, fallback);
      setState((s) => ({ ...s, [kind]: 'success' }));
      setTimeout(() => setState((s) => ({ ...s, [kind]: 'idle' })), 2500);
    } catch (err) {
      setState((s) => ({ ...s, [kind]: 'error' }));
      setError(err.response?.data?.message || `Could not generate the ${kind === 'pdf' ? 'PDF' : 'Excel'} report. Please try again.`);
    }
  };

  return (
    <div className="card plan-section" style={{ marginBottom: 16 }}>
      <div className="routine-card-head">
        <span className="routine-icon">📤</span>
        <h3>Export Reports</h3>
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 16 }}>
        Download a full skin health report — assessment, score breakdown, routine, adherence, product
        recommendations and progress — using your real, current account data.
      </p>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={state.pdf === 'loading'}
          onClick={() => handleExport('pdf')}
        >
          {state.pdf === 'loading' ? <span className="spinner" /> : state.pdf === 'success' ? '✓ Downloaded' : '📄 Download PDF'}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={state.excel === 'loading'}
          onClick={() => handleExport('excel')}
        >
          {state.excel === 'loading' ? <span className="spinner" /> : state.excel === 'success' ? '✓ Downloaded' : '📊 Export Excel'}
        </button>
      </div>
    </div>
  );
}
