import { apiFetch } from './client'
import type { JournalEntry } from '../types'

export const journalsApi = {
  list: (): Promise<JournalEntry[]> =>
    apiFetch<JournalEntry[]>('/api/journals'),

  create: (body: { title?: string; content: string; isPrivate: boolean }): Promise<JournalEntry> =>
    apiFetch<JournalEntry>('/api/journals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (id: string, body: { title?: string; content?: string; isPrivate?: boolean }): Promise<JournalEntry> =>
    apiFetch<JournalEntry>(`/api/journals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  delete: (id: string): Promise<void> =>
    apiFetch<void>(`/api/journals/${id}`, { method: 'DELETE' }),
}
