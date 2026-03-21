import { apiFetch } from './client'

interface FieldDef {
  id: string; name: string; createdAt: string; deletedAt: string | null
}
interface MemberFieldEntry {
  fieldId: string; memberId: string; value: string; updatedAt: string
}

export const fieldsApi = {
  listDefs: () =>
    apiFetch<FieldDef[]>('/api/fields'),

  createDef: (name: string) =>
    apiFetch<FieldDef>('/api/fields', {
      method: 'POST',
      body: JSON.stringify({ name }),
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
