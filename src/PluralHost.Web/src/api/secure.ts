import { apiFetch } from './client'

export interface SecureStatus {
  pinIsSet: boolean
  deletionCooldownEnd: string | null
}

export const secureApi = {
  status: (): Promise<SecureStatus> =>
    apiFetch<SecureStatus>('/api/secure/status'),

  setPin: (body: { currentPin?: string; newPin: string }): Promise<void> =>
    apiFetch<void>('/api/secure/pin', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
}
