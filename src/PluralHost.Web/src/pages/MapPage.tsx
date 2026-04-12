import { useState, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { relationshipsApi } from '../api/relationships'
import { frontApi } from '../api/front'
import { bucketsApi } from '../api/buckets'
import { useSigmaGraph } from '../hooks/useSigmaGraph'
import { type MapMode, type ViewFilter } from '../utils/mapUtils'
import { SigmaMapCanvas } from '../components/Map/SigmaMapCanvas'
import { DetailPanel, type SelectedNode } from '../components/Map/DetailPanel'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'
import type { Member, Group, MemberRelationship, SpEnvelope, FrontContent, PrivacyBucket } from '../types'
import styles from './MapPage.module.css'

export default function MapPage() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<MapMode>('both')
  const [viewFilter, setViewFilter] = useState<ViewFilter>({ type: 'all' })
  const [selected, setSelected] = useState<SelectedNode>(null)
  const [connectMode, setConnectMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members       = [] } = useQuery<Member[]>({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups        = [] } = useQuery<Group[]>({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [] } = useQuery<MemberRelationship[]>({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front         = [] } = useQuery<SpEnvelope<FrontContent>[]>({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })
  const { data: buckets       = [] } = useQuery<PrivacyBucket[]>({ queryKey: ['buckets'], queryFn: bucketsApi.list })

  const fronterIds = useMemo(
    () => new Set((front as SpEnvelope<FrontContent>[]).map(f => f.content.member)),
    [front]
  )

  const graph = useSigmaGraph(members, groups, relationships, fronterIds, viewFilter, mode)

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      setSelected({ type: 'member', id: nodeId.slice('member-'.length) })
    } else if (nodeId.startsWith('group-')) {
      setSelected({ type: 'group', id: nodeId.slice('group-'.length) })
    }
  }, [])

  const handleNodeDoubleClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      const id = nodeId.slice('member-'.length)
      const m  = members.find(mem => mem.id === id)
      if (m) setViewFilter({ type: 'member', id, name: m.displayName || m.name })
    } else if (nodeId.startsWith('group-')) {
      const id = nodeId.slice('group-'.length)
      const g  = groups.find(grp => grp.id === id)
      if (g) setViewFilter({ type: 'group', id, name: g.name })
    }
  }, [members, groups])

  const handleConnect = useCallback((fromNodeId: string, toNodeId: string) => {
    const fromId = fromNodeId.slice('member-'.length)
    const toId   = toNodeId.slice('member-'.length)
    if (fromId !== toId) {
      setConnectFrom(fromId)
      setConnectTo(toId)
      setSheetOpen(true)
      setConnectMode(false)
    }
  }, [])

  const fromMember = members.find(m => m.id === connectFrom)
  const toMember   = members.find(m => m.id === connectTo)
  const selectedNodeId =
    selected?.type === 'member' ? `member-${selected.id}` :
    selected?.type === 'group'  ? `group-${selected.id}` : null

  return (
    <div className={styles.page}>
      <FloatingToolbar
        mode={mode}
        onModeChange={setMode}
        viewFilter={viewFilter}
        onFilterChange={setViewFilter}
        members={members}
        groups={groups}
        connectMode={connectMode}
        onConnectModeChange={setConnectMode}
      />
      <div className={styles.canvas}>
        <SigmaMapCanvas
          graph={graph}
          selectedNodeId={selectedNodeId}
          connectMode={connectMode}
          onNodeClick={handleNodeClick}
          onNodeDoubleClick={handleNodeDoubleClick}
          onConnect={handleConnect}
        />
      </div>
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
            setConnectFrom(null)
            setConnectTo(null)
            qc.invalidateQueries({ queryKey: ['relationships'] })
          }}
        />
      )}
    </div>
  )
}
