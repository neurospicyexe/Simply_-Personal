import { apiFetch } from './client'
import type { FieldDef, MemberFieldEntry } from '../types'

export const fieldsApi = {
  listDefs: () =>
    apiFetch<FieldDef[]>('/api/fields'),

  createDef: (label: string) =>
    apiFetch<FieldDef>('/api/fields', {
      method: 'POST',
      body: JSON.stringify({ label, fieldType: 0 }),
    }),

  getMemberFields: (memberId: string) =>
    apiFetch<MemberFieldEntry[]>(`/api/members/${memberId}/fields`),

  upsertMemberField: (memberId: string, fieldId: string, value: string) =>
    apiFetch<MemberFieldEntry>(`/api/members/${memberId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  deleteMemberField: (memberId: string, fieldId: string) =>
    apiFetch<void>(`/api/members/${memberId}/fields/${fieldId}`, { method: 'DELETE' }),
}
