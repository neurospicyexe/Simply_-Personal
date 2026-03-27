import { apiFetch } from './client'
import type { PrivacyBucket } from '../types'

// Fixed GUIDs for the four seeded default buckets
export const PUBLIC_BUCKET_ID  = '00000000-0000-0000-0000-000000000001'
export const FRIEND_BUCKET_ID  = '00000000-0000-0000-0000-000000000002'
export const TRUSTED_BUCKET_ID = '00000000-0000-0000-0000-000000000003'
export const PRIVATE_BUCKET_ID = '00000000-0000-0000-0000-000000000004'

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
