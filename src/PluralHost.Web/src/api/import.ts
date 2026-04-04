import { apiFetch } from './client'

// ── SP types (flat SP export format) ─────────────────────────────────

export interface SpMemberEntry {
  _id: string
  name?: string
  desc?: string
  pronouns?: string
  color?: string
  avatarUrl?: string
  private?: boolean
  archived?: boolean
  pkId?: string
  preventsFrontNotifs?: boolean
  receiveMessageBoardNotifs?: boolean
  info?: Record<string, string>
}

export interface SpGroupEntry {
  _id: string
  name?: string
  desc?: string
  color?: string
  emoji?: string
  members?: string[]
}

export interface SpCustomFieldEntry {
  _id: string
  name?: string
  order?: string
}

export interface SpFrontHistoryEntry {
  _id: string
  member?: string
  startTime: number
  endTime?: number
}

export interface SpImportPayload {
  conflictStrategy: string
  includeCustomFields: boolean
  includeFrontHistory: boolean
  includeAvatars: boolean
  includeGroups: boolean
  members: SpMemberEntry[]
  customFields: SpCustomFieldEntry[]
  frontHistory: SpFrontHistoryEntry[]
  groups: SpGroupEntry[]
}

// ── PK types ──────────────────────────────────────────────────────────

export interface PkImportPayload {
  token: string
  conflictStrategy: string
  includeFrontHistory: boolean
  includeAvatars: boolean
}

// ── Shared result ─────────────────────────────────────────────────────

export interface ImportError {
  sourceId: string
  name: string | null
  reason: string
}

export interface ImportResult {
  created: number
  updated: number
  skipped: number
  errors: ImportError[]
  avatarsDownloaded: number
  avatarsFailed: number
  frontHistoryImported: number
  groupsImported: number
}

// ── API calls ─────────────────────────────────────────────────────────

export const importApi = {
  importSp: (payload: SpImportPayload) =>
    apiFetch<ImportResult>('/api/import/simply-plural', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  importPk: (payload: PkImportPayload) =>
    apiFetch<ImportResult>('/api/import/plural-kit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
}
