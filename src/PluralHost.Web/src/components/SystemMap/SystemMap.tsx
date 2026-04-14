import { useMemo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../../api/members'
import { groupsApi } from '../../api/groups'
import { relationshipsApi } from '../../api/relationships'
import { frontApi } from '../../api/front'
import { useSigmaGraph } from '../../hooks/useSigmaGraph'
import { type MapMode } from '../../utils/mapUtils'
import { SigmaMapCanvas } from '../Map/SigmaMapCanvas'
import { NewRelationshipSheet } from './NewRelationshipSheet'
import styles from './SystemMap.module.css'
import type { Member, Group, MemberRelationship, SpEnvelope, FrontContent } from '../../types'
import type { ViewFilter } from '../../utils/mapUtils'

// Stable reference — inline `{ type: 'all' }` creates a new object every render,
// which would defeat useSigmaGraph's useMemo and rebuild the graph on every re-render.
const VIEW_ALL: ViewFilter = { type: 'all' }

interface Props {
  initialMode?: MapMode
}

export function SystemMap({ initialMode = 'groups' }: Props) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<MapMode>(initialMode)
  const [connectMode, setConnectMode] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members = [], isLoading: ml } = useQuery<Member[]>({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups = [], isLoading: gl }  = useQuery<Group[]>({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [], isLoading: rl } = useQuery<MemberRelationship[]>({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = [], isLoading: fl } = useQuery<SpEnvelope<FrontContent>[]>({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })

  const isLoading = ml || gl || rl || fl

  const fronterIds = useMemo(
    () => new Set((front as SpEnvelope<FrontContent>[]).map(f => f.content.member)),
    [front]
  )

  const graph = useSigmaGraph(members, groups, relationships, fronterIds, VIEW_ALL, mode)

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith('member-')) {
      navigate(`/members/${nodeId.slice('member-'.length)}`)
    }
  }, [navigate])

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

  return (
    <div className={styles.canvas}>
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
        <button
          className={`${styles.chip} ${connectMode ? styles.active : ''}`}
          onClick={() => setConnectMode(c => !c)}
        >
          {connectMode ? 'Connecting…' : 'Connect'}
        </button>
      </div>
      <div style={{ height: 'calc(100% - 36px)' }}>
        {isLoading
          ? <div className={styles.loadingOverlay}>Loading map…</div>
          : (
            <SigmaMapCanvas
              graph={graph}
              selectedNodeId={null}
              connectMode={connectMode}
              onNodeClick={handleNodeClick}
              onConnect={handleConnect}
            />
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
