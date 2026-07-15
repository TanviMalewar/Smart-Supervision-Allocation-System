// frontend/src/hooks/useApi.js
// Central API call utility that injects the Supabase JWT automatically
import { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000/api';

export function useApi() {
  const { getToken } = useAuth();

  const call = useCallback(async (method, path, body = null, isFormData = false) => {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    const res = await fetch(`${API_URL}${path}`, options);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }, [getToken]);

  const download = useCallback(async (path) => {
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
  }, [getToken]);

  const get      = useCallback((path)        => call('GET',    path),             [call]);
  const post     = useCallback((path, body)  => call('POST',   path, body),       [call]);
  const put      = useCallback((path, body)  => call('PUT',    path, body),       [call]);
  const del      = useCallback((path)        => call('DELETE', path),             [call]);
  const upload   = useCallback((path, fd)    => call('POST',   path, fd, true),   [call]);

  return { get, post, put, del, upload, download };
}

