import { apiFetch } from './client'
import type { AccessToken, TokenCreatePayload } from '../types'

export const tokensApi = {
  list: (): Promise<AccessToken[]> =>
    apiFetch<AccessToken[]>('/api/tokens'),

  create: (body: TokenCreatePayload): Promise<AccessToken> =>
    apiFetch<AccessToken>('/api/tokens', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  update: (tokenValue: string, body: { label?: string; minBucketSortOrder?: number; allowsBoardPosting?: boolean }): Promise<AccessToken> =>
    apiFetch<AccessToken>(`/api/tokens/${tokenValue}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  revoke: (tokenValue: string, pin: string): Promise<void> =>
    apiFetch<void>(`/api/tokens/${tokenValue}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  delete: (tokenValue: string, pin: string): Promise<void> =>
    apiFetch<void>(`/api/tokens/${tokenValue}/delete`, {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),
}
