import type { Member, Group, MemberRelationship } from '../types'

export type MapMode = 'groups' | 'relationships' | 'both'

export type ViewFilter =
  | { type: 'all' }
  | { type: 'group'; id: string; name: string }
  | { type: 'member'; id: string; name: string }

export function buildSubgraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  viewFilter: ViewFilter,
  mode: MapMode
): { memberIds: string[]; groupIds: string[]; linkPairs: Array<[string, string]> } {
  const showGroups = mode === 'groups' || mode === 'both'
  const showRels   = mode === 'relationships' || mode === 'both'

  let memberIds: string[]
  let groupIds: string[]

  if (viewFilter.type === 'group') {
    memberIds = members.filter(m => m.parentIds.includes(viewFilter.id)).map(m => m.id)
    groupIds  = showGroups ? [viewFilter.id] : []
  } else if (viewFilter.type === 'member') {
    const connected = new Set<string>([viewFilter.id])
    if (showRels) {
      relationships.forEach(r => {
        if (r.fromMemberId === viewFilter.id) connected.add(r.toMemberId)
        if (r.toMemberId   === viewFilter.id) connected.add(r.fromMemberId)
      })
    }
    memberIds = members.filter(m => connected.has(m.id)).map(m => m.id)
    groupIds  = []
  } else {
    memberIds = members.map(m => m.id)
    groupIds  = showGroups ? groups.map(g => g.id) : []
  }

  const memberIdSet = new Set(memberIds)
  const groupIdSet  = new Set(groupIds)
  const linkPairs: Array<[string, string]> = []

  if (showGroups) {
    members.forEach(m => {
      if (!memberIdSet.has(m.id)) return
      m.parentIds.forEach(gid => {
        if (groupIdSet.has(gid)) linkPairs.push([`member-${m.id}`, `group-${gid}`])
      })
    })
    // Nested group edges: child → parent group
    groups.forEach(g => {
      if (!groupIdSet.has(g.id)) return
      if (g.parentGroupId && groupIdSet.has(g.parentGroupId)) {
        linkPairs.push([`group-${g.id}`, `group-${g.parentGroupId}`])
      }
    })
  }
  if (showRels) {
    relationships.forEach(r => {
      if (memberIdSet.has(r.fromMemberId) && memberIdSet.has(r.toMemberId)) {
        linkPairs.push([`member-${r.fromMemberId}`, `member-${r.toMemberId}`])
      }
    })
  }

  return { memberIds, groupIds, linkPairs }
}
