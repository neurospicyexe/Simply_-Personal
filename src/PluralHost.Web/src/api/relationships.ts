import { apiFetch } from './client'
import type { MemberRelationship } from '../types'

export const relationshipsApi = {
  list: (): Promise<MemberRelationship[]> =>
    apiFetch<MemberRelationship[]>('/api/members/relationships'),

  create: (payload: {
    fromMemberId: string
    toMemberId: string
    label: string
    isDirected: boolean
  }): Promise<MemberRelationship> =>
    apiFetch<MemberRelationship>('/api/members/relationships', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: { label?: string; isDirected?: boolean }): Promise<MemberRelationship> =>
    apiFetch<MemberRelationship>(`/api/members/relationships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  remove: (id: string): Promise<void> =>
    apiFetch<void>(`/api/members/relationships/${id}`, { method: 'DELETE' }),
}
