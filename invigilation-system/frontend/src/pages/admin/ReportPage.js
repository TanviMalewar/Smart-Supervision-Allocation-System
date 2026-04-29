// frontend/src/pages/admin/ReportPage.js
import React, { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import toast from 'react-hot-toast';

const COLS = [
  { key: 'Course Code',        w: 100 },
  { key: 'Course Name',        w: 260 },
  { key: 'Day and Date',       w: 180 },
  { key: 'Time',               w: 180 },
  { key: 'Faculty Name',       w: 180 },
  { key: 'Mobile No.',         w: 120 },
  { key: 'Department',         w: 160 },
  { key: 'Is Subject Faculty', w: 80  },
];

export default function ReportPage() {
  const api = useApi();
  const [report,   setReport]   = useState([]);
  const [summary,  setSummary]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [tab,      setTab]      = useState('allocations');
  const [search,   setSearch]   = useState('');
  const [downloading, setDL]    = useState(false);

  useEffect(() => {
    Promise.all([api.get('/report?format=json'), api.get('/report/summary')])
      .then(([r, s]) => { setReport(r.data || []); setSummary(s || []); setLoading(false); })
      .catch(e => { toast.error(e.message); setLoading(false); });
  }, []);

  const handleDownload = async () => {
    setDL(true);
    try { await api.download('/report?format=csv'); toast.success('CSV downloaded!'); }
    catch (e) { toast.error(e.message); }
    finally { setDL(false); }
  };

  const filtered = report.filter(r =>
    !search ||
    Object.values(r).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  const maxDuty = summary.length ? Math.max(...summary.map(f => f.duty_count), 1) : 1;

  return (
    <div style={{ padding: 32, color: '#e2e8f0' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Reports</h1>
          <p style={{ color: '#64748b', marginTop: 4, fontSize: 14 }}>
            {report.length} assignments · {summary.length} faculty
          </p>
        </div>
        <button onClick={handleDownload} disabled={downloading} style={{
          padding: '11px 24px',
          background: 'linear-gradient(135deg, #059669, #10b981)',
          border: 'none', borderRadius: 12, color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: downloading ? 'not-allowed' : 'pointer',
          boxShadow: '0 4px 15px rgba(16,185,129,0.3)',
        }}>
          {downloading ? '⏳ Downloading...' : '⬇️ Export CSV'}
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Duties',    value: report.length,                                    color: '#6366f1' },
          { label: 'Faculty Active',  value: summary.filter(f => f.duty_count > 0).length,     color: '#22c55e' },
          { label: 'Subject Faculty Assigned', value: report.filter(r => r['Is Subject Faculty'] === 'YES').length, color: '#f59e0b' },
          { label: 'Fully Loaded',    value: summary.filter(f => f.duty_count >= f.max_duty).length, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 14, padding: 18 }}>
            <div style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            <div style={{ color: s.color, fontSize: 26, fontWeight: 700, marginTop: 4 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: '#0f172a', padding: 4, borderRadius: 10, width: 'fit-content' }}>
        {[['allocations','📋 Allocation Table'],['workload','📊 Workload']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '8px 20px',
            background: tab === k ? '#1e293b' : 'transparent',
            border: tab === k ? '1px solid #334155' : '1px solid transparent',
            borderRadius: 8, color: tab === k ? '#e2e8f0' : '#64748b',
            cursor: 'pointer', fontSize: 14, fontWeight: tab === k ? 600 : 400,
          }}>{l}</button>
        ))}
      </div>

      {loading ? <p style={{ color: '#64748b' }}>Loading...</p> : (
        <>
          {/* ── Allocation Table ── */}
          {tab === 'allocations' && (
            <>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by faculty, course, date..."
                style={{ padding: '9px 14px', background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 13, outline: 'none', marginBottom: 14, width: 320 }}
              />
              <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#0f172a' }}>
                      {COLS.map(c => (
                        <th key={c.key} style={{ color: '#64748b', fontWeight: 500, textAlign: 'left', padding: '11px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', minWidth: c.w }}>
                          {c.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ ...td, color: '#818cf8', fontFamily: 'monospace', fontWeight: 700 }}>{r['Course Code']}</td>
                        <td style={td}>{r['Course Name']}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{r['Day and Date']}</td>
                        <td style={td}>
                          <span style={{
                            padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                            background: r['Time'].includes('AM') ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                            color: r['Time'].includes('AM') ? '#22c55e' : '#f59e0b',
                          }}>{r['Time'].includes('AM') ? 'FN' : 'AN'}</span>
                          <span style={{ color: '#64748b', fontSize: 11, marginLeft: 6 }}>{r['Time']}</span>
                        </td>
                        <td style={{ ...td, fontWeight: 600, color: '#e2e8f0' }}>{r['Faculty Name']}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{r['Mobile No.']}</td>
                        <td style={{ ...td, color: '#94a3b8' }}>{r['Department']}</td>
                        <td style={td}>
                          {r['Is Subject Faculty'] === 'YES' && (
                            <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                              ⭐ SUBJECT
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
                    {report.length === 0 ? 'No allocations yet. Generate allocations first.' : 'No results match your search.'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* ── Workload ── */}
          {tab === 'workload' && (
            <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: 24 }}>
              <h3 style={{ color: '#f1f5f9', margin: '0 0 20px', fontSize: 16 }}>Faculty Workload Distribution</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...summary].sort((a,b) => b.duty_count - a.duty_count).map(f => {
                  const pct    = (f.duty_count / maxDuty) * 100;
                  const capPct = (f.duty_count / f.max_duty) * 100;
                  const over   = f.duty_count >= f.max_duty;
                  return (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 200, flexShrink: 0 }}>
                        <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600 }}>{f.name}</div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>{f.department}</div>
                      </div>
                      <div style={{ flex: 1, background: '#0f172a', borderRadius: 6, height: 16, overflow: 'hidden' }}>
                        <div style={{
                          width: `${pct}%`, height: '100%', borderRadius: 6,
                          background: over ? 'linear-gradient(90deg,#ef4444,#f87171)' : capPct > 70 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)',
                          transition: 'width 0.5s ease',
                        }} />
                      </div>
                      <div style={{ width: 70, textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ color: over ? '#f87171' : '#e2e8f0', fontWeight: 700 }}>{f.duty_count}</span>
                        <span style={{ color: '#64748b', fontSize: 12 }}>/{f.max_duty}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const td = { padding: '10px 14px', color: '#cbd5e1', borderBottom: '1px solid rgba(255,255,255,0.05)', verticalAlign: 'middle' };
