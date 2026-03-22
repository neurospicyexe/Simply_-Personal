import { apiFetch } from './client'
import type { PrivacyBucket } from '../types'

// Fixed GUID for the Public default bucket -- used when removing a member from a custom bucket
export const PUBLIC_BUCKET_ID = '00000000-0000-0000-0000-000000000001'

export const bucketsApi = {
  list: () =>
    apiFetch<PrivacyBucket[]>('/api/buckets'),

  create: (data: { name: string; description?: string; emoji?: string; color?: string }) =>
    apiFetch<PrivacyBucket>('/api/buckets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<{ name: string; description: string; emoji: string; color: string; sortOrder: number }>) =>
    apiFetch<PrivacyBucket>(`/api/buckets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/buckets/${id}`, { method: 'DELETE' }),

  reorder: (items: Array<{ id: string; sortOrder: number }>) =>
    apiFetch<void>('/api/buckets/reorder', {
      method: 'PUT',
      body: JSON.stringify(items),
    }),
}
