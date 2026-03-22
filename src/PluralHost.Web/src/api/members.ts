import { apiFetch } from './client'
import type { Member, CreateMemberPayload, MemberUpdatePayload } from '../types'

export const membersApi = {
  list: () => apiFetch<Member[]>('/api/members'),
  get: (id: string) => apiFetch<Member>(`/api/members/${id}`),
  create: (payload: CreateMemberPayload) =>
    apiFetch<Member>('/api/members', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: MemberUpdatePayload) =>
    apiFetch<Member>(`/api/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  delete: (id: string, pin: string) =>
    apiFetch<void>(`/api/members/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
