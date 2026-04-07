import { useState, useCallback, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type OnConnect,
  type NodeMouseHandler,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { relationshipsApi } from '../api/relationships'
import { frontApi } from '../api/front'
import { bucketsApi } from '../api/buckets'
import { useMapLayout, type MapMode, type ViewFilter } from '../hooks/useMapLayout'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import { GroupNodeV2 } from '../components/Map/GroupNodeV2'
import { DetailPanel, type SelectedNode } from '../components/Map/DetailPanel'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import { RelationshipEdge } from '../components/SystemMap/RelationshipEdge'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'
import type { Member, Group, MemberRelationship, SpEnvelope, FrontContent, PrivacyBucket } from '../types'
import styles from './MapPage.module.css'

const nodeTypes = { memberV2: MemberNodeV2, groupV2: GroupNodeV2 }
const edgeTypes = { relationship: RelationshipEdge }
const EMPTY_MEMBERS: Member[] = []
const EMPTY: never[] = []

function MapCanvas() {
  const { fitView } = useReactFlow()
  const qc = useQueryClient()

  const [mode, setMode] = useState<MapMode>('both')
  const [viewFilter, setViewFilter] = useState<ViewFilter>({ type: 'all' })
  const [selected, setSelected] = useState<SelectedNode>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members = EMPTY_MEMBERS } = useQuery<Member[]>({ queryKey: ['members'],       queryFn: membersApi.list })
  const { data: groups = EMPTY }          = useQuery<Group[]>({ queryKey: ['groups'],         queryFn: groupsApi.list })
  const { data: relationships = EMPTY }   = useQuery<MemberRelationship[]>({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = EMPTY }           = useQuery<SpEnvelope<FrontContent>[]>({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })
  const { data: buckets = EMPTY }         = useQuery<PrivacyBucket[]>({ queryKey: ['buckets'], queryFn: bucketsApi.list })

  const fronterIds = useMemo(
    () => new Set(front.map(f => f.content.member)),
    [front]
  )

  const { nodes: rfNodes, edges: rfEdges } = useMapLayout(
    members,
    groups,
    relationships,
    fronterIds,
    viewFilter,
    mode
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges)

  useEffect(() => { setNodes(rfNodes) }, [rfNodes, setNodes])
  useEffect(() => { setEdges(rfEdges) }, [rfEdges, setEdges])

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id.startsWith('member-')) {
      setSelected({ type: 'member', id: node.id.replace('member-', '') })
    } else if (node.id.startsWith('group-')) {
      setSelected({ type: 'group', id: node.id.replace('group-', '') })
    }
  }, [])

  const onNodeDoubleClick: NodeMouseHandler = useCallback((_, node) => {
    if (node.id.startsWith('member-')) {
      const id = node.id.replace('member-', '')
      const m = members.find(mem => mem.id === id)
      if (m) setViewFilter({ type: 'member', id, name: m.displayName || m.name })
    } else if (node.id.startsWith('group-')) {
      const id = node.id.replace('group-', '')
      const g = groups.find(grp => grp.id === id)
      if (g) setViewFilter({ type: 'group', id, name: g.name })
    }
  }, [members, groups])

  const onConnect: OnConnect = useCallback((connection) => {
    if (!connection.source || !connection.target) return
    if (!connection.source.startsWith('member-') || !connection.target.startsWith('member-')) return
    const fromId = connection.source.replace('member-', '')
    const toId = connection.target.replace('member-', '')
    if (fromId !== toId) {
      setConnectFrom(fromId)
      setConnectTo(toId)
      setSheetOpen(true)
    }
  }, [])

  const fromMember = members.find(m => m.id === connectFrom)
  const toMember   = members.find(m => m.id === connectTo)

  const isEmpty = rfNodes.length === 0
  const emptyMessage = viewFilter.type !== 'all'
    ? `No connections found for ${viewFilter.name}`
    : 'No members yet — add one to get started'

  return (
    <div className={styles.canvas} onClick={e => {
      if ((e.target as HTMLElement).closest('.react-flow__node')) return
      setSelected(null)
    }}>
      <FloatingToolbar
        mode={mode}
        onModeChange={setMode}
        viewFilter={viewFilter}
        onFilterChange={setViewFilter}
        members={members}
        groups={groups}
        onAdd={() => { if (connectFrom && connectTo) setSheetOpen(true) }}
        onFitView={() => fitView({ padding: 0.2 })}
      />

      {isEmpty && (
        <div className={styles.emptyState}>
          <p>{emptyMessage}</p>
          {viewFilter.type !== 'all' && (
            <button onClick={() => setViewFilter({ type: 'all' })}>Clear filter</button>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1a1a1a" variant={BackgroundVariant.Dots} gap={20} size={1} />
        <MiniMap
          style={{ background: '#111' }}
          maskColor="rgba(0,0,0,0.6)"
          className={styles.minimap}
        />
        <Controls className={styles.controls} showInteractive={false} />
      </ReactFlow>

      <DetailPanel
        selected={selected}
        members={members}
        groups={groups}
        relationships={relationships}
        fronterIds={fronterIds}
        buckets={buckets}
        onClose={() => setSelected(null)}
      />

      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => {
            setSheetOpen(false)
            qc.invalidateQueries({ queryKey: ['relationships'] })
          }}
        />
      )}
    </div>
  )
}

export default function MapPage() {
  return (
    <ReactFlowProvider>
      <MapCanvas />
    </ReactFlowProvider>
  )
}
