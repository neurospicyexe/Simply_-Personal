import { useMemo } from 'react'
import { MultiGraph } from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type { Member, Group, MemberRelationship } from '../types'
import { buildSubgraph, type MapMode, type ViewFilter } from '../utils/mapUtils'

// Deterministic pseudo-random 0..1 from a string seed.
// Stable across re-renders — front polling re-runs useMemo every 30s and
// Math.random() would scramble all node positions on every refetch.
function stableRand(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return (h >>> 0) / 0xFFFFFFFF
}

// Place groups in a circle (top-level) or near their parent (nested).
// Returns a position map used to seed member nodes into the right clusters.
function computeGroupPositions(
  groupIds: string[],
  groupMap: Map<string, Group>
): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>()
  const groupIdSet = new Set(groupIds)

  const topLevel = groupIds.filter(id => {
    const g = groupMap.get(id)
    return !g?.parentGroupId || !groupIdSet.has(g.parentGroupId)
  })
  const nested = groupIds.filter(id => !topLevel.includes(id))

  // Top-level groups: spread in a circle large enough to separate clusters
  const r = Math.max(400, Math.sqrt(topLevel.length) * 250)
  topLevel.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, topLevel.length)
    pos.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
  })

  // Nested groups: up to 3 passes handles chains up to 3 levels deep
  for (let pass = 0; pass < 3; pass++) {
    nested.forEach(id => {
      if (pos.has(id)) return
      const g = groupMap.get(id)
      const parentPos = g?.parentGroupId ? pos.get(g.parentGroupId) : undefined
      if (parentPos) {
        pos.set(id, {
          x: parentPos.x + (stableRand(id + 'nx') - 0.5) * 220,
          y: parentPos.y + (stableRand(id + 'ny') - 0.5) * 220,
        })
      }
    })
  }
  // Any remaining nested groups (parent not resolved) get a random fallback
  nested.forEach(id => {
    if (!pos.has(id)) {
      pos.set(id, {
        x: (stableRand(id + 'fx') - 0.5) * 600,
        y: (stableRand(id + 'fy') - 0.5) * 600,
      })
    }
  })

  return pos
}

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

    // Cluster centers for member seeding — groups spread before members placed
    const groupPos = computeGroupPositions(groupIds, groupMap)

    // Member nodes: seed near their first group's cluster center
    memberIds.forEach(id => {
      const m = memberMap.get(id)
      if (!m) return
      const firstGroupId = m.parentIds.find(gid => groupPos.has(gid))
      const center = firstGroupId ? groupPos.get(firstGroupId)! : { x: 0, y: 0 }
      const spread = firstGroupId ? 120 : 300
      graph.addNode(`member-${id}`, {
        x: center.x + (stableRand(id + 'x') - 0.5) * spread,
        y: center.y + (stableRand(id + 'y') - 0.5) * spread,
        size: fronterIds.has(id) ? 14 : 10,
        color: m.color ?? '#b6ff00',
        label: m.displayName || m.name,
        nodeType: 'member',
        memberId: id,
        isFronting: fronterIds.has(id),
      })
    })

    // Group nodes: at their pre-computed cluster center
    groupIds.forEach(id => {
      const g = groupMap.get(id)
      if (!g) return
      const { x, y } = groupPos.get(id) ?? {
        x: (stableRand(id + 'x') - 0.5) * 400,
        y: (stableRand(id + 'y') - 0.5) * 400,
      }
      graph.addNode(`group-${id}`, {
        x, y,
        size: 18,
        color: g.color ?? '#666666',
        label: g.name,
        nodeType: 'group',
        groupId: id,
        memberCount: g.memberCount,
      })
    })

    const relMap = new Map(
      relationships.map(r => [`member-${r.fromMemberId}>>member-${r.toMemberId}`, r])
    )

    linkPairs.forEach(([source, target]) => {
      if (!graph.hasNode(source) || !graph.hasNode(target)) return

      if (source.startsWith('group-') && target.startsWith('group-')) {
        // Nested group containment edge
        graph.addEdge(source, target, {
          edgeType: 'groupNesting',
          color: '#555555',
          size: 0.8,
          label: '',
        })
      } else if (target.startsWith('group-')) {
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

    // Synchronous FA2 pre-pass: runs before the async worker picks it up.
    // The first rendered frame is already force-directed — no spaghetti on load.
    if (graph.order > 0) {
      forceAtlas2.assign(graph, {
        iterations: 150,
        settings: {
          gravity: 1,
          scalingRatio: 3,
          slowDown: 3,
          barnesHutOptimize: graph.order > 80,
          barnesHutTheta: 0.5,
        },
      })
    }

    return graph
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
