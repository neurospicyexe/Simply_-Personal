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
  const nodeSet = new Set(nodeIds)
  linkPairs.forEach(([s, t]) => { if (nodeSet.has(s) && nodeSet.has(t)) g.setEdge(s, t) })
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
    const groupMap = new Map(groups.map(g => [g.id, g]))

    const nodes: Node[] = memberIds.flatMap(id => {
      const m = members.find(mem => mem.id === id)
      if (!m) return []
      const pos = posMap.get(`member-${id}`) ?? { x: 0, y: 0 }
      return [{
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
      }]
    })

    groupIds.forEach(id => {
      const g = groupMap.get(id)
      if (!g) return
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

    const edges: Edge[] = linkPairs.map(([source, target]) => {
      if (target.startsWith('group-')) {
        const gid = target.replace('group-', '')
        const grp = groupMap.get(gid)
        return {
          id: `membership-${source}-${target}`,
          source,
          target,
          style: { stroke: grp?.color ?? '#666', strokeWidth: 1, strokeOpacity: 0.35 },
        }
      }
      const rel = relationships.find(r =>
        `member-${r.fromMemberId}` === source && `member-${r.toMemberId}` === target
      )
      return {
        id: rel ? `rel-${rel.id}` : `rel-${source}-${target}`,
        source,
        target,
        type: 'relationship' as const,
        data: rel ? { label: rel.label, isDirected: rel.isDirected } : { label: '', isDirected: false },
      }
    })

    return { nodes, edges }
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
