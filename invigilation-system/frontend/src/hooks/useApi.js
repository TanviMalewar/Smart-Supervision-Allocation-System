// frontend/src/hooks/useApi.js
// Central API call utility that injects the Supabase JWT automatically
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export function useApi() {
  const { getToken } = useAuth();

  const call = async (method, path, body = null, isFormData = false) => {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${API_URL}${path}`, options);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const download = async (path) => {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invigilation_report_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return {
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
    put: (path, body) => call('PUT', path, body),
    del: (path) => call('DELETE', path),
    upload: (path, formData) => call('POST', path, formData, true),
    download,
  };
}
