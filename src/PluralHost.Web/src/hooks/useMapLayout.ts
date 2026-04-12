import dagre from '@dagrejs/dagre'
import { useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import type { Member, Group, MemberRelationship } from '../types'
export type { MapMode, ViewFilter } from '../utils/mapUtils'
import { buildSubgraph } from '../utils/mapUtils'

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

const GRID_GAP_X = NODE_W + 30
const GRID_GAP_Y = NODE_H + 30

function runDagre(
  nodeIds: string[],
  linkPairs: Array<[string, string]>,
  rankdir: 'TB' | 'LR'
): Map<string, { x: number; y: number }> {
  const posMap = new Map<string, { x: number; y: number }>()

  // Only run Dagre on nodes that have at least one edge — isolated nodes fed to
  // Dagre all land in one horizontal rank, producing the "flat line" layout.
  const connectedSet = new Set(linkPairs.flatMap(([s, t]) => [s, t]))
  const connectedIds = nodeIds.filter(id => connectedSet.has(id))
  const isolatedIds  = nodeIds.filter(id => !connectedSet.has(id))

  if (connectedIds.length > 0) {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir, ranksep: rankdir === 'LR' ? 100 : 80, nodesep: rankdir === 'LR' ? 50 : 60 })
    connectedIds.forEach(id => g.setNode(id, { width: NODE_W, height: NODE_H }))
    linkPairs.forEach(([s, t]) => { if (connectedSet.has(s) && connectedSet.has(t)) g.setEdge(s, t) })
    dagre.layout(g)
    connectedIds.forEach(id => {
      const pos = g.node(id)
      posMap.set(id, { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 })
    })
  }

  // Place isolated nodes in a centered grid below any connected cluster.
  let maxY = 0
  posMap.forEach(pos => { maxY = Math.max(maxY, pos.y + NODE_H) })
  const gridOffsetY = connectedIds.length > 0 ? maxY + 80 : 0
  const cols = Math.max(1, Math.ceil(Math.sqrt(isolatedIds.length)))
  const gridStartX = -((cols * GRID_GAP_X) / 2) + NODE_W / 2

  isolatedIds.forEach((id, i) => {
    posMap.set(id, {
      x: gridStartX + (i % cols) * GRID_GAP_X,
      y: gridOffsetY + Math.floor(i / cols) * GRID_GAP_Y,
    })
  })

  return posMap
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
