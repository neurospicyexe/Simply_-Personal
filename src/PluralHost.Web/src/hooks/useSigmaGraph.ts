import { useMemo, useRef } from 'react'
import { MultiGraph } from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import noverlap from 'graphology-layout-noverlap'
import betweennessCentrality from 'graphology-metrics/centrality/betweenness'
import type { Member, Group, MemberRelationship } from '../types'
import { buildSubgraph, type MapMode, type ViewFilter } from '../utils/mapUtils'

// Deterministic pseudo-random 0..1 from a string seed.
function stableRand(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return (h >>> 0) / 0xFFFFFFFF
}

// Place groups in a circle (top-level) or near their parent (nested).
function computeGroupPositions(
  groupIds: string[],
  groupMap: Map<string, Group>
): { pos: Map<string, { x: number; y: number }>; clusterRadius: number } {
  const pos = new Map<string, { x: number; y: number }>()
  const groupIdSet = new Set(groupIds)

  const topLevel = groupIds.filter(id => {
    const g = groupMap.get(id)
    return !g?.parentGroupId || !groupIdSet.has(g.parentGroupId)
  })
  const nested = groupIds.filter(id => !topLevel.includes(id))

  const r = Math.max(400, Math.sqrt(topLevel.length) * 250)
  topLevel.forEach((id, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, topLevel.length)
    pos.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r })
  })

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
  nested.forEach(id => {
    if (!pos.has(id)) {
      pos.set(id, {
        x: (stableRand(id + 'fx') - 0.5) * 600,
        y: (stableRand(id + 'fy') - 0.5) * 600,
      })
    }
  })

  return { pos, clusterRadius: r }
}

export const FA2_SETTINGS = {
  gravity: 0.1,
  scalingRatio: 100,
  slowDown: 1,
  barnesHutTheta: 0.5,
  outboundAttractionDistribution: true,
  strongGravityMode: false,
} as const

export function useSigmaGraph(
  members: Member[],
  groups: Group[],
  relationships: MemberRelationship[],
  fronterIds: Set<string>,
  viewFilter: ViewFilter,
  mode: MapMode
): MultiGraph {
  const prevGraphRef = useRef<MultiGraph | null>(null)

  return useMemo(() => {
    const graph = new MultiGraph()
    const prevGraph = prevGraphRef.current

    const { memberIds, groupIds, linkPairs } = buildSubgraph(
      members, groups, relationships, viewFilter, mode
    )

    const memberMap = new Map(members.map(m => [m.id, m]))
    const groupMap  = new Map(groups.map(g => [g.id, g]))

    const { pos: groupPos, clusterRadius } = computeGroupPositions(groupIds, groupMap)

    const ungroupedR = Math.max(clusterRadius + 400, 900)
    const grouped: string[]   = []
    const ungrouped: string[] = []
    memberIds.forEach(id => {
      const m = memberMap.get(id)
      if (m?.parentIds.some(gid => groupPos.has(gid))) grouped.push(id)
      else ungrouped.push(id)
    })

    ungrouped.forEach((id, i) => {
      const m = memberMap.get(id)
      if (!m) return
      const nodeId = `member-${id}`
      
      let x = 0, y = 0
      if (prevGraph?.hasNode(nodeId)) {
        x = prevGraph.getNodeAttribute(nodeId, 'x')
        y = prevGraph.getNodeAttribute(nodeId, 'y')
      } else {
        const angle = (2 * Math.PI * i) / Math.max(1, ungrouped.length)
        x = Math.cos(angle) * ungroupedR + (stableRand(id + 'x') - 0.5) * 150
        y = Math.sin(angle) * ungroupedR + (stableRand(id + 'y') - 0.5) * 150
      }

      graph.addNode(nodeId, {
        x, y,
        size: fronterIds.has(id) ? 14 : 10,
        color: m.color ?? '#b6ff00',
        label: m.displayName || m.name,
        nodeType: 'member',
        memberId: id,
        isFronting: fronterIds.has(id),
      })
    })

    grouped.forEach(id => {
      const m = memberMap.get(id)
      if (!m) return
      const nodeId = `member-${id}`

      let x = 0, y = 0
      if (prevGraph?.hasNode(nodeId)) {
        x = prevGraph.getNodeAttribute(nodeId, 'x')
        y = prevGraph.getNodeAttribute(nodeId, 'y')
      } else {
        const firstGroupId = m.parentIds.find(gid => groupPos.has(gid))!
        const center = groupPos.get(firstGroupId)!
        x = center.x + (stableRand(id + 'x') - 0.5) * 160
        y = center.y + (stableRand(id + 'y') - 0.5) * 160
      }

      graph.addNode(nodeId, {
        x, y,
        size: fronterIds.has(id) ? 14 : 10,
        color: m.color ?? '#b6ff00',
        label: m.displayName || m.name,
        nodeType: 'member',
        memberId: id,
        isFronting: fronterIds.has(id),
      })
    })

    groupIds.forEach(id => {
      const g = groupMap.get(id)
      if (!g) return
      const nodeId = `group-${id}`

      let x = 0, y = 0
      if (prevGraph?.hasNode(nodeId)) {
        x = prevGraph.getNodeAttribute(nodeId, 'x')
        y = prevGraph.getNodeAttribute(nodeId, 'y')
      } else {
        const pos = groupPos.get(id) ?? {
          x: (stableRand(id + 'x') - 0.5) * 400,
          y: (stableRand(id + 'y') - 0.5) * 400,
        }
        x = pos.x
        y = pos.y
      }

      graph.addNode(nodeId, {
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
        graph.addEdge(source, target, { edgeType: 'groupNesting', color: '#555555', size: 0.8, label: '' })
      } else if (target.startsWith('group-')) {
        const gid = target.slice('group-'.length)
        const g   = groupMap.get(gid)
        graph.addEdge(source, target, { edgeType: 'membership', color: g?.color ?? '#444444', size: 0.5, label: '' })
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

    if (graph.order > 0) {
      const centrality = betweennessCentrality(graph)
      graph.forEachNode((node, attr) => {
        const c = centrality[node] ?? 0
        const isMember = attr.nodeType === 'member'
        const baseSize = isMember ? 8 : 16
        const extra    = c * 50
        const finalSize = Math.max(baseSize, Math.min(32, baseSize + extra))
        graph.setNodeAttribute(node, 'size', finalSize)
        graph.setNodeAttribute(node, 'zIndex', -Math.round(finalSize))
      })

      // Only run expensive FA2 pre-pass on completely new graphs
      // Existing graphs maintain positions and rely on the LayoutWorker for fine-tuning
      const isNewGraph = !prevGraph || Math.abs(graph.order - prevGraph.order) > (prevGraph.order * 0.2)
      
      if (isNewGraph) {
        forceAtlas2.assign(graph, {
          iterations: 300,
          settings: {
            ...FA2_SETTINGS,
            barnesHutOptimize: graph.order > 50,
          },
        })

        noverlap.assign(graph, {
          maxIterations: 100,
          settings: { margin: 15, speed: 3, ratio: 1.5, gridSize: 40 },
        })
      }
    }

    prevGraphRef.current = graph
    return graph
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
