import { apiFetch } from './client'

interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export const notesApi = {
  list: (memberId: string) =>
    apiFetch<MemberNote[]>(`/api/members/${memberId}/notes`),

  create: (memberId: string, body: { title: string; content: string }) =>
    apiFetch<MemberNote>(`/api/members/${memberId}/notes`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (memberId: string, noteId: string, body: { title?: string; content?: string }) =>
    apiFetch<MemberNote>(`/api/members/${memberId}/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (memberId: string, noteId: string) =>
    apiFetch<void>(`/api/members/${memberId}/notes/${noteId}`, { method: 'DELETE' }),
}
