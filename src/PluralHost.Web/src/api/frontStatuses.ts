import { apiFetch } from './client'

export interface FrontStatus {
  id: string
  label: string
  color: string | null
  isDefault: boolean
  isHidden: boolean
  createdAt: string
}

export const frontStatusesApi = {
  list: () =>
    apiFetch<FrontStatus[]>('/api/front-statuses'),

  create: (label: string, color?: string | null) =>
    apiFetch<FrontStatus>('/api/front-statuses', {
      method: 'POST',
      body: JSON.stringify({ label, color: color ?? null }),
    }),

  update: (id: string, data: { label?: string; color?: string | null; isHidden?: boolean }) =>
    apiFetch<FrontStatus>(`/api/front-statuses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string, pin: string) =>
    apiFetch<void>(`/api/front-statuses/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
