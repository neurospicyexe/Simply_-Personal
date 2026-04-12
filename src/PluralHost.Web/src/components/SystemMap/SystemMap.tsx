import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type OnConnect,
} from '@xyflow/react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force'
import '@xyflow/react/dist/style.css'

import { membersApi } from '../../api/members'
import { groupsApi } from '../../api/groups'
import { relationshipsApi } from '../../api/relationships'
import { frontApi } from '../../api/front'
import { MemberNode, type MemberNodeData } from './MemberNode'
import { GroupNode, type GroupNodeData } from './GroupNode'
import { RelationshipEdge, type RelationshipEdgeData } from './RelationshipEdge'
import { NewRelationshipSheet } from './NewRelationshipSheet'
import styles from './SystemMap.module.css'
import type { Member, Group, MemberRelationship } from '../../types'

type MapMode = 'groups' | 'relationships' | 'both'

const nodeTypes = { member: MemberNode, group: GroupNode }
const edgeTypes = { relationship: RelationshipEdge }

interface D3Node { id: string; x?: number; y?: number }
interface D3Link { source: string; target: string }

function runLayout(d3Nodes: D3Node[], d3Links: D3Link[], width: number, height: number): D3Node[] {
  const nodesCopy = d3Nodes.map(n => ({ ...n }))
  const sim = forceSimulation<D3Node>(nodesCopy)
    .force('link', forceLink<D3Node, D3Link>(d3Links.map(l => ({ ...l }))).id(d => d.id).distance(120))
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(40))
    .stop()
  sim.tick(300)
  return nodesCopy
}

interface Props {
  initialMode?: MapMode
}

export function SystemMap({ initialMode = 'groups' }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<MapMode>(initialMode)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasDims, setCanvasDims] = useState({ width: 800, height: 600 })

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) setCanvasDims({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { data: members = [], isLoading: membersLoading } = useQuery({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups = [], isLoading: groupsLoading } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [], isLoading: relsLoading } = useQuery({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = [], isLoading: frontLoading } = useQuery({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })

  const isLoading = membersLoading || groupsLoading || relsLoading || frontLoading

  const frontingIds = useMemo(
    () => new Set((front as { content: { member: string } }[]).map(f => f.content.member)),
    [front]
  )

  const { rfNodes, rfEdges } = useMemo(() => {
    const WIDTH = canvasDims.width
    const HEIGHT = canvasDims.height

    const showGroups = mode === 'groups' || mode === 'both'
    const showRelationships = mode === 'relationships' || mode === 'both'

    const groupById = new Map((groups as Group[]).map(g => [g.id, g]))

    const d3Nodes: D3Node[] = (members as Member[]).map(m => ({ id: `member-${m.id}` }))
    if (showGroups) {
      (groups as Group[]).forEach(g => d3Nodes.push({ id: `group-${g.id}` }))
    }

    const d3Links: D3Link[] = []
    if (showGroups) {
      (members as Member[]).forEach(m =>
        m.parentIds.forEach(gid => {
          if (groupById.has(gid)) {
            d3Links.push({ source: `member-${m.id}`, target: `group-${gid}` })
          }
        })
      )
    }
    if (showRelationships) {
      (relationships as MemberRelationship[]).forEach(r => {
        d3Links.push({ source: `member-${r.fromMemberId}`, target: `member-${r.toMemberId}` })
      })
    }

    const positioned = runLayout(d3Nodes, d3Links, WIDTH, HEIGHT)
    const posMap = new Map(positioned.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))
    const connectedIds = new Set(d3Links.flatMap(l => [l.source, l.target]))

    const rfNodes: Node[] = (members as Member[]).map(m => {
      const pos = posMap.get(`member-${m.id}`) ?? { x: 0, y: 0 }
      const data: MemberNodeData = {
        id: m.id,
        name: m.displayName || m.name,
        color: m.color,
        isFronting: frontingIds.has(m.id),
        isIsolated: !connectedIds.has(`member-${m.id}`),
      }
      return { id: `member-${m.id}`, type: 'member', position: pos, data }
    })

    if (showGroups) {
      (groups as Group[]).forEach(g => {
        const pos = posMap.get(`group-${g.id}`) ?? { x: 0, y: 0 }
        const data: GroupNodeData = { name: g.name, color: g.color }
        rfNodes.push({ id: `group-${g.id}`, type: 'group', position: pos, data })
      })
    }

    const rfEdges: Edge[] = []
    if (showGroups) {
      (members as Member[]).forEach(m =>
        m.parentIds.forEach(gid => {
          const grp = groupById.get(gid)
          if (!grp) return
          rfEdges.push({
            id: `membership-${m.id}-${gid}`,
            source: `member-${m.id}`,
            target: `group-${gid}`,
            style: { stroke: grp.color ?? '#666', strokeWidth: 1, strokeOpacity: 0.35 },
          })
        })
      )
    }
    if (showRelationships) {
      (relationships as MemberRelationship[]).forEach(r => {
        const edgeData: RelationshipEdgeData = { label: r.label, isDirected: r.isDirected }
        rfEdges.push({
          id: `rel-${r.id}`,
          source: `member-${r.fromMemberId}`,
          target: `member-${r.toMemberId}`,
          type: 'relationship',
          data: edgeData,
        })
      })
    }

    return { rfNodes, rfEdges }
  }, [members, groups, relationships, frontingIds, mode, canvasDims])

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => { setNodes(rfNodes) }, [rfNodes, setNodes])
  useEffect(() => { setEdges(rfEdges) }, [rfEdges, setEdges])

  const onConnect: OnConnect = useCallback((connection) => {
    if (connection.source && connection.target) {
      const fromId = connection.source.slice('member-'.length)
      const toId = connection.target.slice('member-'.length)
      if (fromId !== toId && connection.source.startsWith('member-') && connection.target.startsWith('member-')) {
        setConnectFrom(fromId)
        setConnectTo(toId)
        setSheetOpen(true)
      }
    }
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'member') {
      navigate(`/members/${(node.data as MemberNodeData).id}`)
    }
  }, [navigate])

  const fromMember = useMemo(
    () => (members as Member[]).find(m => m.id === connectFrom),
    [members, connectFrom]
  )
  const toMember = useMemo(
    () => (members as Member[]).find(m => m.id === connectTo),
    [members, connectTo]
  )

  return (
    <div className={styles.canvas} ref={canvasRef}>
      <div className={styles.modeChips}>
        {(['groups', 'relationships', 'both'] as MapMode[]).map(m => (
          <button
            key={m}
            className={`${styles.chip} ${mode === m ? styles.active : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ height: 'calc(100% - 36px)' }}>
        {isLoading
          ? <div className={styles.loadingOverlay}>Loading map…</div>
          : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#1a1a1a" variant={BackgroundVariant.Dots} gap={20} size={1} />
            </ReactFlow>
          )
        }
      </div>
      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => {
            setSheetOpen(false)
            setConnectFrom(null)
            setConnectTo(null)
          }}
        />
      )}
    </div>
  )
}
