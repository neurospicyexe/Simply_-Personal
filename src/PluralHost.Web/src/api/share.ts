export interface ShareMember {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string | null
  description?: string | null
  status?: number
  customFields: { label: string; fieldType: number; value: string }[]
}

export interface ShareFrontEntry {
  memberId: string
  name: string
  displayName?: string
  color?: string
  avatarPath?: string | null
  customStatusLabel?: string | null
  customStatusColor?: string | null
}

export interface ShareData {
  members: ShareMember[]
  currentFront: ShareFrontEntry[]
}

export interface ShareBoardMessage {
  id: string
  memberId: string
  authorName: string
  content: string
  tokenId?: string | null
  createdAt: string
}

export interface ShareHistoryEntry {
  id: string
  frontStart: string
  frontEnd?: string | null
  statusLabel?: string | null
  statusColor?: string | null
}

export const shareApi = {
  get: (token: string): Promise<ShareData> =>
    fetch(`/share/${token}`, { credentials: 'include' })
      .then(r => {
        if (r.status === 204 || r.status === 401) return { members: [], currentFront: [] }
        if (!r.ok) throw new Error(r.status.toString())
        return r.json()
      })
      .then((data: Partial<ShareData>) => ({
        members: data.members ?? [],
        currentFront: data.currentFront ?? [],
      })),

  getBoard: (token: string, memberId: string): Promise<ShareBoardMessage[]> =>
    fetch(`/share/${token}/board/${memberId}`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) return []
        return r.json()
      }),

  getHistory: (token: string, memberId: string): Promise<ShareHistoryEntry[]> =>
    fetch(`/share/${token}/history/${memberId}`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) return []
        return r.json()
      }),
}
