import { apiFetch } from './client'

interface BoardMessage {
  id: string; memberId: string; authorName: string; content: string; createdAt: string
}

export const boardApi = {
  list: (memberId: string) =>
    apiFetch<BoardMessage[]>(`/api/members/${memberId}/board`),

  post: (memberId: string, body: { authorName: string; content: string }) =>
    apiFetch<BoardMessage>(`/api/members/${memberId}/board`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  delete: (memberId: string, msgId: string) =>
    apiFetch<void>(`/api/members/${memberId}/board/${msgId}`, { method: 'DELETE' }),
}
