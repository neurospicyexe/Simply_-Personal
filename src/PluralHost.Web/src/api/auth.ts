import { apiFetch } from './client'

export const authApi = {
  login: (password: string) =>
    apiFetch<void>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    apiFetch<void>('/api/auth/logout', { method: 'POST' }),

  status: () =>
    apiFetch<{ isAuthenticated: boolean }>('/api/auth/status'),
}
