import { apiFetch } from './client'
import type { SpEnvelope, Group } from '../types'

export const groupsApi = {
  list: () => apiFetch<SpEnvelope<Group>[]>('/v1/groups/owner'),

  setMemberships: (memberId: string, groupIds: string[]) =>
    apiFetch<void>('/v1/group/members', {
      method: 'PATCH',
      body: JSON.stringify({ member: memberId, groups: groupIds }),
    }),
}
