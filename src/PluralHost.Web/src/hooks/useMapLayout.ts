import dagre from '@dagrejs/dagre'
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Member, Group, MemberRelationship } from '../types'

export type MapMode = 'groups' | 'relationships' | 'both'

export type ViewFilter =
  | { type: 'all' }
  | { type: 'group'; id: string; name: string }
  | { type: 'member'; id: string; name: string }

export type MemberNodeV2Data = {
  id: string
  name: string
  color?: string
  pronouns?: string | null
  isFronting: boolean
  isIsolated: boolean
}

export type GroupNodeV2Data = {
  id: string
  name: string
  color?: string | null
  memberCount: number
}

const NODE_W = 80
const NODE_H = 70

export function buildSubgraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  viewFilter: ViewFilter,
  mode: MapMode
): { memberIds: string[]; groupIds: string[]; linkPairs: Array<[string, string]> } {
  const showGroups = mode === 'groups' || mode === 'both'
  const showRels = mode === 'relationships' || mode === 'both'

  let memberIds: string[]
  let groupIds: string[]

  if (viewFilter.type === 'group') {
    memberIds = members.filter(m => m.parentIds.includes(viewFilter.id)).map(m => m.id)
    groupIds = showGroups ? [viewFilter.id] : []
  } else if (viewFilter.type === 'member') {
    const connected = new Set<string>([viewFilter.id])
    if (showRels) {
      relationships.forEach(r => {
        if (r.fromMemberId === viewFilter.id) connected.add(r.toMemberId)
        if (r.toMemberId === viewFilter.id) connected.add(r.fromMemberId)
      })
    }
    memberIds = members.filter(m => connected.has(m.id)).map(m => m.id)
    groupIds = []
  } else {
    memberIds = members.map(m => m.id)
    groupIds = showGroups ? groups.map(g => g.id) : []
  }

  const memberIdSet = new Set(memberIds)
  const groupIdSet = new Set(groupIds)
  const linkPairs: Array<[string, string]> = []

  if (showGroups) {
    members.forEach(m => {
      if (!memberIdSet.has(m.id)) return
      m.parentIds.forEach(gid => {
        if (groupIdSet.has(gid)) linkPairs.push([`member-${m.id}`, `group-${gid}`])
      })
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

function runDagre(
  nodeIds: string[],
  linkPairs: Array<[string, string]>,
  rankdir: 'TB' | 'LR'
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir, ranksep: rankdir === 'LR' ? 100 : 80, nodesep: rankdir === 'LR' ? 50 : 60 })
  nodeIds.forEach(id => g.setNode(id, { width: NODE_W, height: NODE_H }))
  linkPairs.forEach(([s, t]) => { if (nodeIds.includes(s) && nodeIds.includes(t)) g.setEdge(s, t) })
  dagre.layout(g)
  return new Map(nodeIds.map(id => {
    const pos = g.node(id)
    return [id, { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 }]
  }))
}

export function useMapLayout(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode
): { nodes: Node[]; edges: Edge[] } {
  return useMemo(() => {
    const { memberIds, groupIds, linkPairs } = buildSubgraph(members, groups, relationships, viewFilter, mode)
    const rankdir = viewFilter.type === 'member' ? 'LR' : 'TB'
    const allNodeIds = [
      ...memberIds.map(id => `member-${id}`),
      ...groupIds.map(id => `group-${id}`),
    ]
    const posMap = runDagre(allNodeIds, linkPairs, rankdir)
    const connectedNodeIds = new Set(linkPairs.flatMap(([s, t]) => [s, t]))
    const showGroups = mode === 'groups' || mode === 'both'
    const showRels = mode === 'relationships' || mode === 'both'

    const nodes: Node[] = memberIds.map(id => {
      const m = members.find(mem => mem.id === id)!
      const pos = posMap.get(`member-${id}`) ?? { x: 0, y: 0 }
      return {
        id: `member-${id}`,
        type: 'memberV2',
        position: pos,
        data: {
          id,
          name: m.displayName || m.name,
          color: m.color ?? undefined,
          pronouns: m.pronouns,
          isFronting: fronterIds.has(id),
          isIsolated: !connectedNodeIds.has(`member-${id}`),
        } satisfies MemberNodeV2Data,
      }
    })

    groupIds.forEach(id => {
      const g = groups.find(grp => grp.id === id)!
      const pos = posMap.get(`group-${id}`) ?? { x: 0, y: 0 }
      nodes.push({
        id: `group-${id}`,
        type: 'groupV2',
        position: pos,
        data: {
          id,
          name: g.name,
          color: g.color,
          memberCount: members.filter(m => m.parentIds.includes(id)).length,
        } satisfies GroupNodeV2Data,
      })
    })

    const edges: Edge[] = []
    if (showGroups) {
      members.forEach(m => {
        if (!memberIds.includes(m.id)) return
        m.parentIds.forEach(gid => {
          if (!groupIds.includes(gid)) return
          const grp = groups.find(g => g.id === gid)!
          edges.push({
            id: `membership-${m.id}-${gid}`,
            source: `member-${m.id}`,
            target: `group-${gid}`,
            style: { stroke: grp.color ?? '#666', strokeWidth: 1, strokeOpacity: 0.35 },
          })
        })
      })
    }
    if (showRels) {
      relationships.forEach(r => {
        if (!memberIds.includes(r.fromMemberId) || !memberIds.includes(r.toMemberId)) return
        edges.push({
          id: `rel-${r.id}`,
          source: `member-${r.fromMemberId}`,
          target: `member-${r.toMemberId}`,
          type: 'relationship',
          data: { label: r.label, isDirected: r.isDirected },
        })
      })
    }

    return { nodes, edges }
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
