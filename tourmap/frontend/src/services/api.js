import axios from 'axios';

// ── Instância base ────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Callback de logout (registrado pelo AuthContext) ──────────────────────────
// Padrão: só limpa o storage (sem redirect, pois AuthContext não está montado ainda)

let _authLogout = null;

export function setAuthLogout(fn) {
  _authLogout = fn;
}

// ── Interceptor de request: injeta token + CSRF ───────────────────────────────

const SAFE = new Set(['get', 'head', 'options']);

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tourmap_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // Adiciona token CSRF em mutations
  if (!SAFE.has((config.method || 'get').toLowerCase())) {
    const csrf = localStorage.getItem('tourmap_csrf');
    if (csrf) config.headers['X-CSRF-Token'] = csrf;
  }

  return config;
});

// ── Interceptor de response: 401 → logout ────────────────────────────────────

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && _authLogout) {
      // Ignora o 401 do /auth/me (validação inicial do token)
      const url = err.config?.url || '';
      if (!url.includes('/auth/me')) {
        _authLogout();
      }
    }
    return Promise.reject(err);
  }
);

// ── Domínios de API ───────────────────────────────────────────────────────────

export const auth = {
  register:     (data)       => api.post('/auth/register', data),
  login:        (data)       => api.post('/auth/login', data),
  verifyEmail:  (data)       => api.post('/auth/verify-email', data),
  resendCode:   (data)       => api.post('/auth/resend-code', data),
  me:           ()           => api.get('/auth/me'),
};

export const places = {
  list:     (params)         => api.get('/places', { params }),
  ranked:   (params)         => api.get('/places/ranked', { params }),
  recommended: (params)      => api.get('/places/recommended', { params }),
  get:      (id)             => api.get(`/places/${id}`),
  insights: (id)             => api.get(`/places/${id}/insights`),
  create:   (data)           => api.post('/places', data),
  update:   (id, data)       => api.put(`/places/${id}`, data),
  remove:   (id)             => api.delete(`/places/${id}`),
  attendees:(id, params)     => api.get(`/places/${id}/attendees`, { params }),
  attend:   (id, status)     => api.post(`/places/${id}/attendees`, { status }),
  unattend: (id)             => api.delete(`/places/${id}/attendees`),
  reviewOrganizer: (id, data)=> api.post(`/places/${id}/organizer-review`, data),
};

export const reviews = {
  list:   (placeId, params)           => api.get(`/places/${placeId}/reviews`, { params }),
  create: (placeId, data)             => api.post(`/places/${placeId}/reviews`, data),
  update: (placeId, reviewId, data)   => api.put(`/places/${placeId}/reviews/${reviewId}`, data),
  remove: (placeId, reviewId)         => api.delete(`/places/${placeId}/reviews/${reviewId}`),
};

export const posts = {
  list:   (params)   => api.get('/posts', { params }),
  get:    (id)       => api.get(`/posts/${id}`),
  create: (data)     => api.post('/posts', data),
  remove: (id)       => api.delete(`/posts/${id}`),
  like:   (id)       => api.post(`/posts/${id}/like`),
};

export const alerts = {
  list: (params) => api.get('/alerts', { params }),
};

export const users = {
  me:               ()           => api.get('/users/me'),
  update:           (data)       => api.put('/users/me', data),
  myPlaces:         ()           => api.get('/users/me/places'),
  myReviews:        ()           => api.get('/users/me/reviews'),
  attending:        ()           => api.get('/users/me/attending'),
  get:              (id)         => api.get(`/users/${id}`),
  organizerReviews: (id, params) => api.get(`/users/${id}/organizer-reviews`, { params }),
};

export default api;
