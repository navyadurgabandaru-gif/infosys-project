import axios from 'axios';

// Dynamically use VITE_API_URL or fallback directly to live Render backend
const API_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : 'https://ai-skin-backend-74zx.onrender.com/api';

const api = axios.create({ baseURL: API_URL });

// Attach the JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global 401 handling: token invalid/expired -> force back to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const currentPath = window.location.pathname;
      
      // DO NOT force-redirect if we are on login, register, or oauth/callback routes
      if (!currentPath.startsWith('/login') && !currentPath.startsWith('/oauth/callback')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
