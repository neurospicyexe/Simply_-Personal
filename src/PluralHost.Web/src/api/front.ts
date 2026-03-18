import { apiFetch } from './client'
import type { SpEnvelope, FrontContent, FrontCreatePayload, FrontUpdatePayload } from '../types'

export const frontApi = {
  getCurrent: () =>
    apiFetch<SpEnvelope<FrontContent>[]>('/v1/fronters'),

  create: (payload: FrontCreatePayload) =>
    apiFetch<string>('/v1/frontHistory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: FrontUpdatePayload) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, { method: 'DELETE' }),
}
