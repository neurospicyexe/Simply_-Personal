export type PrivacyTier = 'Public' | 'Friend' | 'Trusted' | 'Private'

export interface PrivacyBucket {
  id: string
  name: string
  description: string | null
  emoji: string | null
  color: string | null
  sortOrder: number
  isDefault: boolean
  memberCount: number
}

export interface Member {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  bucketId: string
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
  bucketId?: string
}

export interface MemberUpdatePayload {
  name?: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  bucketId?: string
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
  memberCount: number
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
  fieldType: number
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface MemberFieldEntry {
  fieldId: string
  label: string
  fieldType: number
  sortOrder: number
  value: string | null
  privacyTier: string
}

export interface JournalEntry {
  id: string
  title: string | null
  content: string
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}

export interface AccessToken {
  tokenValue: string
  label: string | null
  minBucketSortOrder: number   // -1 = ReadFrontOnly sentinel
  allowsBoardPosting: boolean
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

export interface TokenCreatePayload {
  label: string
  minBucketSortOrder: number
  allowsBoardPosting: boolean
  expiresAt?: string           // ISO 8601 UTC string, omit for "never"
}

export interface MemberRelationship {
  id: string
  fromMemberId: string
  toMemberId: string
  label: string
  isDirected: boolean
  createdAt: string
  updatedAt: string
}
