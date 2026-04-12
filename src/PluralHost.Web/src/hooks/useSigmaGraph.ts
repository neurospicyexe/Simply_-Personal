import { useMemo } from 'react'
import { MultiGraph } from 'graphology'
import type { Member, Group, MemberRelationship } from '../types'
import { buildSubgraph, type MapMode, type ViewFilter } from '../utils/mapUtils'

export function useSigmaGraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode
): MultiGraph {
  return useMemo(() => {
    const graph = new MultiGraph()
    const { memberIds, groupIds, linkPairs } = buildSubgraph(
      members, groups, relationships, viewFilter, mode
    )

    const memberMap = new Map(members.map(m => [m.id, m]))
    const groupMap  = new Map(groups.map(g => [g.id, g]))
    const allIds = [
      ...memberIds.map(id => `member-${id}`),
      ...groupIds.map(id => `group-${id}`),
    ]
    const total  = allIds.length
    const radius = Math.max(200, Math.sqrt(total) * 80)

    allIds.forEach((nodeId, i) => {
      const angle = (2 * Math.PI * i) / Math.max(1, total)
      const x = Math.cos(angle) * radius
      const y = Math.sin(angle) * radius

      if (nodeId.startsWith('member-')) {
        const id = nodeId.slice('member-'.length)
        const m  = memberMap.get(id)
        if (!m) return
        graph.addNode(nodeId, {
          x, y,
          size: fronterIds.has(id) ? 14 : 10,
          color: m.color ?? '#b6ff00',
          label: m.displayName || m.name,
          nodeType: 'member',
          memberId: id,
          isFronting: fronterIds.has(id),
        })
      } else {
        const id = nodeId.slice('group-'.length)
        const g  = groupMap.get(id)
        if (!g) return
        graph.addNode(nodeId, {
          x, y,
          size: 18,
          color: g.color ?? '#666666',
          label: g.name,
          nodeType: 'group',
          groupId: id,
          memberCount: g.memberCount,
        })
      }
    })

    const relMap = new Map(
      relationships.map(r => [`member-${r.fromMemberId}>>member-${r.toMemberId}`, r])
    )

    linkPairs.forEach(([source, target]) => {
      if (!graph.hasNode(source) || !graph.hasNode(target)) return
      if (target.startsWith('group-')) {
        const gid = target.slice('group-'.length)
        const g   = groupMap.get(gid)
        graph.addEdge(source, target, {
          edgeType: 'membership',
          color: g?.color ?? '#444444',
          size: 0.5,
          label: '',
        })
      } else {
        const rel = relMap.get(`${source}>>${target}`)
        graph.addEdge(source, target, {
          edgeType: 'relationship',
          label: rel?.label ?? '',
          isDirected: rel?.isDirected ?? false,
          color: '#555555',
          size: 1.5,
          type: rel?.isDirected ? 'arrow' : 'line',
        })
      }
    })

    return graph
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
