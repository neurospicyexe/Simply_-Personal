import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSigmaGraph } from '../hooks/useSigmaGraph'
import type { Member, Group, MemberRelationship } from '../types'

const m1: Member = {
  id: 'mem-1', name: 'Jude', displayName: 'Jude', color: '#b6ff00',
  bucketId: 'pub', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: ['grp-1'], parentIds: ['grp-1'], createdAt: '', updatedAt: '',
}
const m2: Member = {
  id: 'mem-2', name: 'Mira', color: '#00d4ff',
  bucketId: 'pub', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [], createdAt: '', updatedAt: '',
}
const g1: Group = { id: 'grp-1', name: 'Core', color: '#ff4db8', memberCount: 1 }
const rel1: MemberRelationship = {
  id: 'rel-1', fromMemberId: 'mem-1', toMemberId: 'mem-2',
  label: 'siblings', isDirected: false, createdAt: '', updatedAt: '',
}

describe('useSigmaGraph', () => {
  it('adds a node for each member in both mode', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [g1], [rel1], new Set(), { type: 'all' }, 'both')
    )
    expect(result.current.hasNode('member-mem-1')).toBe(true)
    expect(result.current.hasNode('member-mem-2')).toBe(true)
  })

  it('adds a group node when mode includes groups', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [g1], [], new Set(), { type: 'all' }, 'groups')
    )
    expect(result.current.hasNode('group-grp-1')).toBe(true)
  })

  it('does not add group nodes in relationships mode', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [g1], [], new Set(), { type: 'all' }, 'relationships')
    )
    expect(result.current.hasNode('group-grp-1')).toBe(false)
  })

  it('sets isFronting attribute on fronting members', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1], [], [], new Set(['mem-1']), { type: 'all' }, 'relationships')
    )
    expect(result.current.getNodeAttribute('member-mem-1', 'isFronting')).toBe(true)
  })

  it('adds relationship edge', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [], [rel1], new Set(), { type: 'all' }, 'relationships')
    )
    expect(result.current.hasEdge('member-mem-1', 'member-mem-2')).toBe(true)
  })

  it('filters to member neighborhood when viewFilter is member', () => {
    const { result } = renderHook(() =>
      useSigmaGraph([m1, m2], [], [rel1], new Set(), { type: 'member', id: 'mem-1', name: 'Jude' }, 'relationships')
    )
    expect(result.current.hasNode('member-mem-1')).toBe(true)
    expect(result.current.hasNode('member-mem-2')).toBe(true)
  })
})
