import { useMemo } from 'react'
import { buildSubgraph, type MapMode, type ViewFilter } from '../utils/mapUtils'
import type { Member, Group, MemberRelationship } from '../types'

export interface GraphNode {
  id: string
  name: string
  color: string
  val: number
  nodeType: 'member' | 'group'
  memberId?: string
  groupId?: string
  isFronting?: boolean
  // react-force-graph mutates these at runtime
  x?: number; y?: number; z?: number
  vx?: number; vy?: number; vz?: number
}

export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  linkType: 'membership' | 'relationship' | 'groupNesting'
  color: string
  directed: boolean
  label?: string
}

export function useForceGraphData(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode,
): { nodes: GraphNode[]; links: GraphLink[] } {
  return useMemo(() => {
    const { memberIds, groupIds, linkPairs } = buildSubgraph(
      members, groups, relationships, viewFilter, mode,
    )

    const memberSet = new Set(memberIds)
    const groupSet  = new Set(groupIds)
    const memberMap = new Map(members.map(m => [m.id, m]))
    const groupMap  = new Map(groups.map(g => [g.id, g]))
    const relMap    = new Map(
      relationships.map(r => [`member-${r.fromMemberId}>>member-${r.toMemberId}`, r]),
    )

    const nodes: GraphNode[] = [
      ...memberIds.map(id => {
        const m = memberMap.get(id)!
        return {
          id: `member-${id}`,
          name: m.displayName || m.name,
          color: m.color ?? '#b6ff00',
          val: fronterIds.has(id) ? 5 : 2,
          nodeType: 'member' as const,
          memberId: id,
          isFronting: fronterIds.has(id),
        }
      }),
      ...groupIds.map(id => {
        const g = groupMap.get(id)!
        return {
          id: `group-${id}`,
          name: g.name,
          color: g.color ?? '#888888',
          val: 10,
          nodeType: 'group' as const,
          groupId: id,
        }
      }),
    ]

    const links: GraphLink[] = linkPairs
      .filter(([src, tgt]) => {
        const srcId = src.startsWith('member-') ? src.slice(7) : src.slice(6)
        const tgtId = tgt.startsWith('member-') ? tgt.slice(7) : tgt.slice(6)
        const srcOk = src.startsWith('member-') ? memberSet.has(srcId) : groupSet.has(srcId)
        const tgtOk = tgt.startsWith('member-') ? memberSet.has(tgtId) : groupSet.has(tgtId)
        return srcOk && tgtOk
      })
      .map(([source, target]) => {
        if (source.startsWith('group-') && target.startsWith('group-')) {
          return { source, target, linkType: 'groupNesting' as const, color: '#444444', directed: false }
        }
        if (target.startsWith('group-')) {
          const g = groupMap.get(target.slice(6))
          return { source, target, linkType: 'membership' as const, color: g?.color ?? '#333333', directed: false }
        }
        const rel = relMap.get(`${source}>>${target}`)
        return {
          source, target,
          linkType: 'relationship' as const,
          color: '#888888',
          directed: rel?.isDirected ?? false,
          label: rel?.label ?? '',
        }
      })

    return { nodes, links }
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
