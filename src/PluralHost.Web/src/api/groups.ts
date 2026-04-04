import { apiFetch } from './client'
import type { Group } from '../types'

export const groupsApi = {
  list: () =>
    apiFetch<Group[]>('/api/groups'),

  create: (data: { name: string; color?: string }) =>
    apiFetch<Group>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; color?: string }) =>
    apiFetch<Group>(`/api/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/api/groups/${id}`, { method: 'DELETE' }),

  setMembers: (groupId: string, memberIds: string[]) =>
    apiFetch<void>(`/api/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),

  addMember: (groupId: string, memberId: string) =>
    apiFetch<void>(`/api/groups/${groupId}/members/${memberId}`, { method: 'POST' }),

  removeMember: (groupId: string, memberId: string) =>
    apiFetch<void>(`/api/groups/${groupId}/members/${memberId}`, { method: 'DELETE' }),
}
