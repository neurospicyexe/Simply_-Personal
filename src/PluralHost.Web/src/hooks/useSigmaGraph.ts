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

  const r = Math.max(2000, Math.sqrt(topLevel.length) * 800)
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
          x: parentPos.x + (stableRand(id + 'nx') - 0.5) * 500,
          y: parentPos.y + (stableRand(id + 'ny') - 0.5) * 500,
        })
      }
    })
  }
  nested.forEach(id => {
    if (!pos.has(id)) {
      pos.set(id, {
        x: (stableRand(id + 'fx') - 0.5) * 1500,
        y: (stableRand(id + 'fy') - 0.5) * 1500,
      })
    }
  })

  return { pos, clusterRadius: r }
}

// High-intensity expansion phase: strong repulsion, low gravity, moderate damping.
// scalingRatio 2500 overpowers gravity so nodes drift outward into a neuron-map layout.
// Equilibrium radius ≈ sqrt(scalingRatio / gravity) ≈ sqrt(25000 / 0.005) ≈ 2236 units.
// Seed positions are pre-placed near that radius so FA2 relaxes rather than travels.
// Membership edges get weight 0.02 — visible but structurally inert in FA2.
// Relationship edges get weight 1.0. edgeWeightInfluence: 1 activates this split.
// Group nodes are pinned (fixed: true) as spatial anchors; members orbit them.
// linLogMode uses log(1+dist) attraction instead of dist — weakens dramatically at range,
// so nodes that are far apart stay far apart. This is what creates the "floating arm" look.
export const FA2_EXPAND = {
  gravity: 0.005,
  scalingRatio: 25000,
  slowDown: 5,
  barnesHutTheta: 0.5,
  outboundAttractionDistribution: true,
  strongGravityMode: false,
  edgeWeightInfluence: 1,
  linLogMode: true,
} as const

export const FA2_SETTLE = {
  gravity: 0.005,
  scalingRatio: 25000,
  slowDown: 30,
  barnesHutTheta: 0.5,
  outboundAttractionDistribution: true,
  strongGravityMode: false,
  edgeWeightInfluence: 1,
  linLogMode: true,
} as const

/** @deprecated use FA2_EXPAND */
export const FA2_SETTINGS = FA2_EXPAND

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

    const ungroupedR = Math.max(clusterRadius + 1800, 4000)

    const grouped: string[]   = []
    const ungrouped: string[] = []
    memberIds.forEach(id => {
      const m = memberMap.get(id)
      if (m?.parentIds.some(gid => groupPos.has(gid))) grouped.push(id)
      else ungrouped.push(id)
    })

    // Golden angle (137.5°) spiral — same packing pattern as sunflower seeds / biological neurons.
    // Distributes N nodes around a hub with no rows, no clusters, maximum visual separation.
    const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

    // Build group → members list so each group's members are placed as one spiral
    const groupToMembers = new Map<string, string[]>()
    groupPos.forEach((_, gid) => groupToMembers.set(gid, []))
    grouped.forEach(id => {
      const m = memberMap.get(id)
      const primaryGid = m?.parentIds.find(gid => groupPos.has(gid))
      if (primaryGid) groupToMembers.get(primaryGid)?.push(id)
    })

    // Precompute spiral seed positions (only used when node has no prevGraph position)
    const spiralSeed = new Map<string, { x: number; y: number }>()
    groupToMembers.forEach((mems, gid) => {
      const center = groupPos.get(gid)!
      const scale = Math.max(300, Math.sqrt(mems.length) * 60)
      mems.forEach((id, i) => {
        const radius = scale * Math.sqrt(i + 1)
        const theta  = GOLDEN_ANGLE * i
        spiralSeed.set(id, {
          x: center.x + radius * Math.cos(theta),
          y: center.y + radius * Math.sin(theta),
        })
      })
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
        x = Math.cos(angle) * ungroupedR + (stableRand(id + 'x') - 0.5) * 300
        y = Math.sin(angle) * ungroupedR + (stableRand(id + 'y') - 0.5) * 300
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
        const seed = spiralSeed.get(id)
        x = seed?.x ?? (stableRand(id + 'x') - 0.5) * 1500
        y = seed?.y ?? (stableRand(id + 'y') - 0.5) * 1500
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
        fixed: true,   // groups are spatial anchors; FA2 leaves them in place
      })
    })

    const relMap = new Map(
      relationships.map(r => [`member-${r.fromMemberId}>>member-${r.toMemberId}`, r])
    )

    linkPairs.forEach(([source, target]) => {
      if (!graph.hasNode(source) || !graph.hasNode(target)) return
      if (source.startsWith('group-') && target.startsWith('group-')) {
        // Low weight: group nesting is structural metadata, not a force line
        graph.addEdge(source, target, { edgeType: 'groupNesting', color: '#555555', size: 0.8, label: '', weight: 0.05 })
      } else if (target.startsWith('group-')) {
        const gid = target.slice('group-'.length)
        const g   = groupMap.get(gid)
        // Near-zero weight: membership edges are visual tethers only.
        // Without this, 500 membership pulls collapse every alter into the group cluster.
        graph.addEdge(source, target, { edgeType: 'membership', color: g?.color ?? '#444444', size: 0.5, label: '', weight: 0.02 })
      } else {
        const rel = relMap.get(`${source}>>${target}`)
        // Full weight: alter-to-alter relationships drive the neuron-arm structure
        graph.addEdge(source, target, {
          edgeType: 'relationship',
          label: rel?.label ?? '',
          isDirected: rel?.isDirected ?? false,
          color: '#555555',
          size: 1.5,
          type: rel?.isDirected ? 'arrow' : 'line',
          weight: 1,
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
        // Geometric spiral seed already places nodes near their final positions.
      // FA2 here only smooths overlaps — not the primary layout driver.
      forceAtlas2.assign(graph, {
          iterations: 80,
          settings: {
            ...FA2_EXPAND,
            barnesHutOptimize: graph.order > 30,
          },
        })

        noverlap.assign(graph, {
          maxIterations: 100,
          settings: { margin: 20, speed: 3, ratio: 1.5, gridSize: 80 },
        })
      }
    }

    prevGraphRef.current = graph
    return graph
  }, [members, groups, relationships, fronterIds, viewFilter, mode])
}
