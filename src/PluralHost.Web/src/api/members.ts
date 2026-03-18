import { apiFetch } from './client'
import type { Member, MemberUpdatePayload } from '../types'

export const membersApi = {
  list: () => apiFetch<Member[]>('/api/members'),
  get: (id: string) => apiFetch<Member>(`/api/members/${id}`),
  update: (id: string, payload: MemberUpdatePayload) =>
    apiFetch<Member>(`/api/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
}
