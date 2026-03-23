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

  revoke: (tokenValue: string, pin: string): Promise<void> =>
    apiFetch<void>(`/api/tokens/${tokenValue}`, {
      method: 'DELETE',
      body: JSON.stringify({ pin }),
    }),
}
