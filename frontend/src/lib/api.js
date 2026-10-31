import axios from 'axios';
import toast from 'react-hot-toast';
import { supabase } from './supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (err) {
    console.error('Error attaching auth token to request:', err);
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

api.interceptors.response.use(
  (response) => {
    // If response is a blob (e.g. PDF download), return directly
    if (response.config?.responseType === 'blob') {
      return response.data;
    }
    // Unwrap { data: ... }
    return response.data?.data !== undefined ? response.data.data : response.data;
  },
  (error) => {
    const errorData = error.response?.data?.error;
    const message = errorData?.message || error.message || 'An error occurred';
    toast.error(message);
    return Promise.reject(error);
  }
);

export default api;
