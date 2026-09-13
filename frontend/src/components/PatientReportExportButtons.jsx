import { useState } from 'react';
import api from '../api/axios';

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

/**
 * Compact PDF/Excel export buttons for a specific patient/client, used
 * inside Doctor and Consultant dashboards (table rows, report modals).
 * Backend enforces the actual authorization (provider must have a real
 * appointment/review relationship with this userId, or the request is
 * rejected with 403) — this component only triggers the request and
 * surfaces whatever the backend decides, so hiding/showing it in the UI
 * is a convenience, never the security boundary.
 */
export default function PatientReportExportButtons({ userId, label }) {
  const [state, setState] = useState({ pdf: 'idle', excel: 'idle' });
  const [error, setError] = useState('');

  const handleExport = async (kind) => {
    setState((s) => ({ ...s, [kind]: 'loading' }));
    setError('');
    try {
      const path = kind === 'pdf'
        ? `/reports/export/pdf?userId=${userId}`
        : `/reports/export/excel?userId=${userId}`;
      const fallback = kind === 'pdf' ? 'patient-report.pdf' : 'patient-report.xlsx';
      await downloadBlob(path, fallback);
      setState((s) => ({ ...s, [kind]: 'success' }));
      setTimeout(() => setState((s) => ({ ...s, [kind]: 'idle' })), 2000);
    } catch (err) {
      setState((s) => ({ ...s, [kind]: 'error' }));
      setError(err.response?.data?.message || `Could not export this ${label || 'patient'}'s report.`);
      setTimeout(() => setError(''), 4000);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', position: 'relative' }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        title="Export PDF"
        disabled={state.pdf === 'loading'}
        onClick={() => handleExport('pdf')}
      >
        {state.pdf === 'loading' ? <span className="spinner" /> : state.pdf === 'success' ? '✓' : '📄 PDF'}
      </button>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        title="Export Excel"
        disabled={state.excel === 'loading'}
        onClick={() => handleExport('excel')}
      >
        {state.excel === 'loading' ? <span className="spinner" /> : state.excel === 'success' ? '✓' : '📊 Excel'}
      </button>
      {error && (
        <span style={{ position: 'absolute', top: '100%', left: 0, fontSize: 11, color: 'var(--color-danger)', whiteSpace: 'nowrap', zIndex: 5 }}>
          {error}
        </span>
      )}
    </span>
  );
}
