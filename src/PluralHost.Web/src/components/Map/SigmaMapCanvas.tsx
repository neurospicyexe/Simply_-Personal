import { useEffect, useRef, useState } from 'react'
import { SigmaContainer, useLoadGraph, useRegisterEvents, useSigma } from '@react-sigma/core'
import '@react-sigma/core/lib/style.css'
import { MultiGraph } from 'graphology'
import FA2Layout from 'graphology-layout-forceatlas2/worker'

interface Props {
  graph: MultiGraph
  selectedNodeId: string | null
  connectMode: boolean
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onConnect: (fromNodeId: string, toNodeId: string) => void
  style?: React.CSSProperties
  className?: string
}

// Module-level constant — avoids recreating the object on every SigmaMapCanvas render,
// which would cause SigmaContainer to see a new settings reference each time.
const SIGMA_SETTINGS = {
  renderEdgeLabels:           false,
  labelColor:                 { color: '#cccccc' },
  labelSize:                  11,
  labelWeight:                '500',
  // Labels only appear once a node reaches 8 CSS px on screen.
  // Hover forces labels on hovered node + neighbors via forceLabel in the nodeReducer.
  labelRenderedSizeThreshold: 8,
  defaultEdgeType:            'line',
  minCameraRatio:             0.02,
  maxCameraRatio:             10,
  zIndex:                     true,
  enableEdgeEvents:           false,
}

// ── GraphLoader ───────────────────────────────────────────────────────────────
// Loads the graph into Sigma and runs FA2 for 8s with Barnes-Hut optimization.
// Nodes marked fixed:true (dragged by user) are left in place by FA2.

function GraphLoader({ graph }: { graph: MultiGraph }) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    loadGraph(graph)
    const layout = new FA2Layout(graph, {
      settings: {
        gravity: 1,
        scalingRatio: 10,
        strongGravityMode: false,
        barnesHutOptimize: true,   // essential for 500+ nodes
        barnesHutTheta: 0.5,
        slowDown: 10,
        linLogMode: false,
        outboundAttractionDistribution: false,
      },
    })
    layout.start()
    const timer = setTimeout(() => layout.stop(), 8000)
    return () => { clearTimeout(timer); layout.stop() }
  }, [graph, loadGraph])

  return null
}

// ── DragController ────────────────────────────────────────────────────────────
// Enables node dragging. Marks dragged nodes fixed so FA2 ignores them
// after the user positions them. Uses a document-level mouseup listener so
// drag always ends even when the mouse leaves the canvas.

function DragController({ connectMode }: { connectMode: boolean }) {
  const sigma = useSigma()
  const registerEvents = useRegisterEvents()
  const drag = useRef<{ active: boolean; nodeId: string | null }>({ active: false, nodeId: null })

  useEffect(() => {
    const endDrag = () => { drag.current = { active: false, nodeId: null } }
    document.addEventListener('mouseup', endDrag)

    registerEvents({
      downNode: (event) => {
        if (connectMode) return
        drag.current = { active: true, nodeId: event.node }
        sigma.getGraph().setNodeAttribute(event.node, 'fixed', true)
      },
      mousemove: (event) => {
        if (!drag.current.active || !drag.current.nodeId) return
        const { x, y, preventSigmaDefault } = event as unknown as {
          x: number; y: number; preventSigmaDefault: () => void
        }
        const pos = sigma.viewportToGraph({ x, y })
        sigma.getGraph().setNodeAttribute(drag.current.nodeId, 'x', pos.x)
        sigma.getGraph().setNodeAttribute(drag.current.nodeId, 'y', pos.y)
        preventSigmaDefault()  // blocks camera pan while dragging a node
      },
    })

    return () => { document.removeEventListener('mouseup', endDrag) }
  }, [sigma, registerEvents, connectMode])

  return null
}

// ── HighlightController ───────────────────────────────────────────────────────
// Three responsibilities:
//   1. Degree-based node sizing (hub nodes larger than isolated ones)
//   2. Hover: dim non-neighbors, reveal neighbor labels, highlight edges
//   3. Edge dimming: near-invisible by default, full opacity on hover
//
// Uses refs for hover state so event handlers don't need re-registration;
// calls sigma.refresh() manually after mutating the refs.

function HighlightController({
  selectedNodeId,
  connectMode,
  pendingFrom,
}: {
  selectedNodeId: string | null
  connectMode: boolean
  pendingFrom: string | null
}) {
  const sigma = useSigma()
  const registerEvents = useRegisterEvents()
  const hoveredNode = useRef<string | null>(null)
  const neighborSet = useRef<Set<string>>(new Set())

  // Register hover events once — mutate refs, trigger manual refresh.
  useEffect(() => {
    registerEvents({
      enterNode: (event) => {
        hoveredNode.current = event.node
        neighborSet.current = new Set(sigma.getGraph().neighbors(event.node))
        sigma.refresh()
      },
      leaveNode: () => {
        hoveredNode.current = null
        neighborSet.current = new Set()
        sigma.refresh()
      },
    })
  }, [sigma, registerEvents])

  // Re-apply reducers when connect state or selection changes.
  // The reducer closures read hoveredNode/neighborSet refs at call-time,
  // so hover changes (above) always see current state without re-running this effect.
  useEffect(() => {
    sigma.setSetting('nodeReducer', (node: string, data: Record<string, unknown>) => {
      // sigma.getGraph() is called inside the reducer (not captured at effect time)
      // so it always reflects the live graph after any loadGraph() call.
      const graph     = sigma.getGraph()
      const hovered   = hoveredNode.current
      const isHovered  = node === hovered
      const isSelected = node === selectedNodeId
      const isPending  = node === pendingFrom
      const isFronting = Boolean(data.isFronting)
      const isMember   = (data.nodeType as string) === 'member'

      const degree = graph.degree(node)
      let size = isMember
        ? Math.max(6,  Math.min(20, 6  + degree * 1.2))
        : Math.max(14, Math.min(26, 14 + degree * 0.6))
      if (isFronting)            size = Math.max(size, 14)
      if (isHovered || isSelected) size *= 1.35
      if (isPending)             size *= 1.5

      let color      = data.color as string
      let forceLabel = isHovered || isSelected
      let zIndex     = 0

      if (connectMode && isMember) {
        color = isPending ? '#b6ff00' : '#2a2a2a'
      } else if (hovered && !isHovered) {
        if (neighborSet.current.has(node)) {
          forceLabel = true
          zIndex     = 5
        } else {
          color  = '#1c1c1c'
          zIndex = -1
        }
      }
      if (isHovered) zIndex = 10

      return { ...data, size, color, forceLabel, zIndex, highlighted: isSelected || isHovered }
    })

    sigma.setSetting('edgeReducer', (edge: string, data: Record<string, unknown>) => {
      const graph        = sigma.getGraph()
      const hovered      = hoveredNode.current
      const isMembership = (data.edgeType as string) === 'membership'
      const baseColor    = data.color as string

      if (hovered) {
        const [src, tgt] = graph.extremities(edge)
        const isConnected = src === hovered || tgt === hovered
        return {
          ...data,
          size:   isConnected ? (isMembership ? 1 : 2.5) : 0.3,
          color:  isConnected ? baseColor : '#0d0d0d',
          hidden: !isConnected,
        }
      }

      // Default: fixed dark color — avoids fragile hex-alpha appending on user-supplied colors.
      return {
        ...data,
        size:  isMembership ? 0.3 : 0.7,
        color: '#333333',
      }
    })

    sigma.refresh()
  }, [sigma, selectedNodeId, connectMode, pendingFrom])

  return null
}

// ── ClickController ───────────────────────────────────────────────────────────
// Handles navigate-on-click and the two-step click-to-connect flow.

function ClickController({
  connectMode,
  pendingFrom,
  onNodeClick,
  onNodeDoubleClick,
  onConnect,
  onPendingFromChange,
}: {
  connectMode: boolean
  pendingFrom: string | null
  onNodeClick: (nodeId: string) => void
  onNodeDoubleClick?: (nodeId: string) => void
  onConnect: (from: string, to: string) => void
  onPendingFromChange: (id: string | null) => void
}) {
  const registerEvents = useRegisterEvents()

  useEffect(() => {
    registerEvents({
      clickNode: (event) => {
        const node = event.node
        if (connectMode) {
          if (!pendingFrom) {
            onPendingFromChange(node.startsWith('member-') ? node : null)
          } else if (node !== pendingFrom && node.startsWith('member-')) {
            onConnect(pendingFrom, node)
            onPendingFromChange(null)
          }
        } else {
          onNodeClick(node)
        }
      },
      doubleClickNode: (event) => {
        if (!connectMode) onNodeDoubleClick?.(event.node)
      },
      clickStage: () => {
        if (connectMode) onPendingFromChange(null)
      },
    })
  }, [registerEvents, connectMode, pendingFrom, onNodeClick, onNodeDoubleClick, onConnect, onPendingFromChange])

  return null
}

// ── SigmaMapCanvas (main export) ──────────────────────────────────────────────

export function SigmaMapCanvas({
  graph,
  selectedNodeId,
  connectMode,
  onNodeClick,
  onNodeDoubleClick,
  onConnect,
  style,
  className,
}: Props) {
  const [pendingFrom, setPendingFrom] = useState<string | null>(null)

  useEffect(() => {
    if (!connectMode) setPendingFrom(null)
  }, [connectMode])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SigmaContainer
        graph={MultiGraph}
        settings={SIGMA_SETTINGS}
        style={{ width: '100%', height: '100%', background: '#0d0d0d', ...style }}
        className={className}
      >
        <GraphLoader graph={graph} />
        <HighlightController
          selectedNodeId={selectedNodeId}
          connectMode={connectMode}
          pendingFrom={pendingFrom}
        />
        <DragController connectMode={connectMode} />
        <ClickController
          connectMode={connectMode}
          pendingFrom={pendingFrom}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onConnect={onConnect}
          onPendingFromChange={setPendingFrom}
        />
      </SigmaContainer>

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
          {pendingFrom
            ? 'Now click the target member'
            : 'Click a member to start connecting'}
        </div>
      )}
    </div>
  )
}
