import { useRef, useEffect, useCallback, useState } from 'react'
import ForceGraph3D from 'react-force-graph-3d'
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { useForceGraphData, type GraphNode, type GraphLink } from '../../hooks/useForceGraphData'
import { type MapMode, type ViewFilter } from '../../utils/mapUtils'
import type { Member, Group, MemberRelationship } from '../../types'

interface Props {
  members: Member[]
  groups: Group[]
  relationships: MemberRelationship[]
  fronterIds: Set<string>
  viewFilter: ViewFilter
  mode: MapMode
  selectedNodeId: string | null
  connectMode: boolean
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onConnect: (fromNodeId: string, toNodeId: string) => void
  style?: React.CSSProperties
  className?: string
}

export function ForceGraph3DCanvas({
  members, groups, relationships, fronterIds,
  viewFilter, mode,
  selectedNodeId, connectMode,
  onNodeClick, onNodeDoubleClick, onConnect,
  style, className,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)

  const { nodes, links } = useForceGraphData(
    members, groups, relationships, fronterIds, viewFilter, mode,
  )

  // Reset pending connect selection when connect mode is toggled off
  useEffect(() => {
    if (!connectMode) setPendingFrom(null)
  }, [connectMode])

  // Configure d3 forces and bloom on mount — runs once, ref is stable
  useEffect(() => {
    const fg = fgRef.current
    if (!fg) return

    // Strong per-node repulsion — the primary spreading force in 3D
    fg.d3Force('charge')?.strength(-800)

    // Link distances by type:
    //   membership  → long but weak  (visual tether, not a force line)
    //   relationship → medium + pull  (the "neuron arm" structure)
    //   groupNesting → short          (parent/child groups stay near each other)
    fg.d3Force('link')
      ?.distance((link: object) => {
        const l = link as GraphLink
        if (l.linkType === 'membership')   return 150
        if (l.linkType === 'groupNesting') return 200
        return 300
      })
      .strength((link: object) => {
        const l = link as GraphLink
        if (l.linkType === 'membership')   return 0.02
        if (l.linkType === 'groupNesting') return 0.1
        return 0.4
      })

    // No center gravity — graph floats freely in 3D space
    fg.d3Force('center', null)

    // Bloom pass: makes colored nodes glow on the dark canvas.
    // strength=1.5, radius=0.8, threshold=0.1 keeps dim membership
    // edges from blooming while vivid member colors fully glow.
    try {
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,
        0.8,
        0.1,
      )
      fg.postProcessingComposer?.().addPass(bloomPass)
    } catch {
      // bloom unavailable in test/headless env — silently skip
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNodeClick = useCallback((node: object) => {
    const n = node as GraphNode
    if (connectMode) {
      if (!pendingFrom) {
        if (n.nodeType === 'member') setPendingFrom(n.id)
      } else if (n.id !== pendingFrom && n.nodeType === 'member') {
        onConnect(pendingFrom, n.id)
        setPendingFrom(null)
      }
    } else {
      onNodeClick(n.id)
    }
  }, [connectMode, pendingFrom, onNodeClick, onConnect])

  const handleNodeDblClick = useCallback((node: object) => {
    if (!connectMode) onNodeDoubleClick?.((node as GraphNode).id)
  }, [connectMode, onNodeDoubleClick])

  const getNodeColor = useCallback((node: object) => {
    const n = node as GraphNode
    if (selectedNodeId === n.id) return '#ffffff'
    if (connectMode && n.nodeType === 'member') {
      return pendingFrom === n.id ? '#b6ff00' : '#2a2a2a'
    }
    return n.color
  }, [selectedNodeId, connectMode, pendingFrom])

  const getNodeVal = useCallback((node: object) => {
    const n = node as GraphNode
    return selectedNodeId === n.id ? (n.val ?? 2) * 1.8 : (n.val ?? 2)
  }, [selectedNodeId])

  const getLinkColor = useCallback((link: object) => {
    const l = link as GraphLink
    return l.linkType === 'membership' ? '#1e1e1e' : l.color
  }, [])

  const getLinkWidth = useCallback((link: object) => {
    const l = link as GraphLink
    return l.linkType === 'relationship' ? 1.5 : 0.3
  }, [])

  const getLinkArrow = useCallback((link: object) => {
    return (link as GraphLink).directed ? 5 : 0
  }, [])

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      className={className}
    >
      <ForceGraph3D
        ref={fgRef}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        graphData={{ nodes: nodes as any[], links: links as any[] }}
        nodeId="id"
        nodeLabel="name"
        nodeColor={getNodeColor}
        nodeVal={getNodeVal}
        nodeOpacity={0.95}
        linkColor={getLinkColor}
        linkWidth={getLinkWidth}
        linkOpacity={0.6}
        linkDirectionalArrowLength={getLinkArrow}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#0d0d0d"
        onNodeClick={handleNodeClick}
        onNodeDblClick={handleNodeDblClick}
        onBackgroundClick={() => { if (connectMode) setPendingFrom(null) }}
      />

      {connectMode && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          border: '1px solid #333',
          borderRadius: 20,
          padding: '4px 14px',
          fontSize: 11,
          color: '#ccc',
          pointerEvents: 'none',
        }}>
          {pendingFrom ? 'Now click the target member' : 'Click a member to start connecting'}
        </div>
      )}
    </div>
  )
}
