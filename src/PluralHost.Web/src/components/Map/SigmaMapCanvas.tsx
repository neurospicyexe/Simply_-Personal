import { useEffect, useState } from 'react'
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

// ---- child components (must be inside SigmaContainer to use hooks) ----

function GraphAndLayoutLoader({ graph }: { graph: MultiGraph }) {
  const loadGraph = useLoadGraph()

  useEffect(() => {
    loadGraph(graph)
    const layout = new FA2Layout(graph, {
      settings: { gravity: 1, scalingRatio: 3, strongGravityMode: false, slowDown: 15 },
    })
    layout.start()
    const timer = setTimeout(() => layout.stop(), 4000)
    return () => { clearTimeout(timer); layout.stop() }
  }, [graph, loadGraph])

  return null
}

function ReducerController({
  selectedNodeId,
  connectMode,
  pendingFrom,
}: {
  selectedNodeId: string | null
  connectMode: boolean
  pendingFrom: string | null
}) {
  const sigma = useSigma()

  useEffect(() => {
    sigma.setSetting('nodeReducer', (node: string, data: Record<string, unknown>) => {
      const isSelected = node === selectedNodeId
      const isPending  = node === pendingFrom
      const isFronting = data.isFronting as boolean
      const isMember   = (data.nodeType as string) === 'member'
      let size  = data.size as number
      let color = data.color as string

      if (connectMode && isMember) {
        color = isPending ? '#b6ff00' : '#333333'
      }
      if (isSelected || isPending) size = size * 1.5
      if (isFronting) size = Math.max(size, 14)

      return { ...data, size, color, highlighted: isSelected }
    })

    sigma.setSetting('edgeReducer', (_edge: string, data: Record<string, unknown>) => {
      const isMembership = (data.edgeType as string) === 'membership'
      return {
        ...data,
        size:  isMembership ? 0.5 : 1.5,
        color: isMembership ? ((data.color as string) + '55') : '#555555',
      }
    })

    sigma.refresh()
  }, [sigma, selectedNodeId, connectMode, pendingFrom])

  return null
}

function EventController({
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

// ---- main export ----

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

  const sigmaSettings = {
    renderEdgeLabels: true,
    labelColor: { color: '#cccccc' },
    labelSize: 10,
    labelWeight: '400',
    defaultEdgeType: 'line',
    minCameraRatio: 0.05,
    maxCameraRatio: 5,
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SigmaContainer
        graph={MultiGraph}
        settings={sigmaSettings}
        style={{ width: '100%', height: '100%', background: '#0d0d0d', ...style }}
        className={className}
      >
        <GraphAndLayoutLoader graph={graph} />
        <ReducerController
          selectedNodeId={selectedNodeId}
          connectMode={connectMode}
          pendingFrom={pendingFrom}
        />
        <EventController
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
