export type PrivacyTier = 'Public' | 'Friend' | 'Trusted' | 'Private'

export interface Member {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  privacyTier: PrivacyTier
  isArchived: boolean
  isUntracked: boolean
  isPinned: boolean
  preventFrontNotification: boolean
  receiveBoardNotifications: boolean
  groupIds: string[]
  parentIds: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateMemberPayload {
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  description?: string
  privacyTier?: PrivacyTier
}

export interface MemberUpdatePayload {
  name?: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  privacyTier?: PrivacyTier
  isArchived?: boolean
  isPinned?: boolean
  preventFrontNotification?: boolean
  receiveBoardNotifications?: boolean
}

export interface SpEnvelope<T> {
  exists: boolean
  id: string
  content: T
}

export interface FrontContent {
  uid: string
  member: string
  live: boolean
  startTime: number
  endTime?: number
  custom: boolean
  customStatus?: string
}

export interface FrontCreatePayload {
  member: string
  live: boolean
  startTime: number
  endTime?: number
  customStatus?: string
}

export interface FrontUpdatePayload {
  live?: boolean
  endTime?: number
  customStatus?: string
  memberId?: string
  startTime?: number
}

export interface Group {
  id: string
  name: string
  description?: string
  color?: string
  emoji?: string
  members: string[]
}

export interface MemberNote {
  id: string
  memberId: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface BoardMessage {
  id: string
  memberId: string
  authorName: string
  content: string
  createdAt: string
}

export interface FieldDef {
  id: string
  label: string
  fieldType: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface MemberFieldEntry {
  fieldId: string
  label: string
  fieldType: string
  sortOrder: number
  value: string | null
  privacyTier: string
}
