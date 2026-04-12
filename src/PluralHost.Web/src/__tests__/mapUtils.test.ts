import { describe, it, expect } from 'vitest'
import { buildSubgraph } from '../utils/mapUtils'
import type { Member, Group, MemberRelationship } from '../types'

const makeMember = (id: string, parentIds: string[] = []): Member => ({
  id,
  name: id,
  displayName: undefined,
  pronouns: undefined,
  color: '#ff0000',
  avatarPath: undefined,
  backgroundImagePath: undefined,
  extraImages: [],
  description: undefined,
  bucketId: 'bucket-1',
  isArchived: false,
  isUntracked: false,
  isPinned: false,
  preventFrontNotification: false,
  receiveBoardNotifications: false,
  groupIds: [],
  parentIds,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

const makeGroup = (id: string): Group => ({
  id,
  name: id,
  color: '#00ff00',
  emoji: undefined,
  parentGroupId: undefined,
  memberCount: 0,
})

const makeRel = (id: string, from: string, to: string): MemberRelationship => ({
  id,
  fromMemberId: from,
  toMemberId: to,
  label: 'friends',
  isDirected: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
})

describe('buildSubgraph', () => {
  const members = [makeMember('a', ['g1']), makeMember('b', ['g1']), makeMember('c')]
  const groups = [makeGroup('g1')]
  const rels = [makeRel('r1', 'a', 'c')]

  it('all mode includes every member and group', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'all' }, 'both')
    expect(result.memberIds).toEqual(['a', 'b', 'c'])
    expect(result.groupIds).toEqual(['g1'])
  })

  it('group focus only includes members in that group', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'group', id: 'g1', name: 'g1' }, 'both')
    expect(result.memberIds).toEqual(['a', 'b'])
    expect(result.groupIds).toEqual(['g1'])
  })

  it('member focus includes focal member and directly connected members', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'member', id: 'a', name: 'a' }, 'relationships')
    expect(result.memberIds).toContain('a')
    expect(result.memberIds).toContain('c')
    expect(result.memberIds).not.toContain('b')
  })

  it('member focus with relationships mode off returns only focal member', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'member', id: 'a', name: 'a' }, 'groups')
    expect(result.memberIds).toEqual(['a'])
  })

  it('isolated member has no link pairs', () => {
    const result = buildSubgraph(members, groups, rels, { type: 'all' }, 'relationships')
    const bNodeId = 'member-b'
    const bIsConnected = result.linkPairs.some(([s, t]) => s === bNodeId || t === bNodeId)
    expect(bIsConnected).toBe(false)
  })
})
