import { useState, useMemo, lazy } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { frontApi } from '../api/front'
import MemberCard from '../components/MemberCard'
import CreateMemberSheet from '../components/CreateMemberSheet'
import GroupSheet from '../components/GroupSheet'
const SystemMap = lazy(() => import('../components/SystemMap/SystemMap').then(m => ({ default: m.SystemMap })))
import styles from './MembersPage.module.css'
import type { Member, Group, SpEnvelope } from '../types'

type ViewMode = 'list' | 'folder' | 'map'
type Density = 'card' | 'compact'

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<ViewMode>('list')
  const [density, setDensity] = useState<Density>('card')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: groupsApi.list,
  })

  const { data: fronters = [] } = useQuery({
    queryKey: ['fronters'],
    queryFn: frontApi.getCurrent,
  })

  const frontingIds = useMemo(
    () => new Set((fronters as SpEnvelope<{ member: string }>[]).map(f => f.content.member)),
    [fronters]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return (members as Member[]).filter(m => m.name.toLowerCase().includes(q))
  }, [members, search])

  // Alphabetical grouping for list mode
  const alphabetGroups = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    const map = new Map<string, Member[]>()
    for (const m of sorted) {
      const letter = ([...m.name][0] ?? '#').toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(m)
    }
    return map
  }, [filtered])

  // Pre-computed map of groupId → filtered members (avoids O(n) scan per renderFolder call)
  const groupMembersMap = useMemo(() => {
    const map = new Map<string, Member[]>()
    for (const m of filtered) {
      for (const gid of m.parentIds) {
        if (!map.has(gid)) map.set(gid, [])
        map.get(gid)!.push(m)
      }
    }
    return map
  }, [filtered])

  // Tree structure for folder mode
  const groupChildrenMap = useMemo(() => {
    const groupIds = new Set((groups as Group[]).map(g => g.id))
    const map = new Map<string | null, Group[]>()
    const sorted = [...(groups as Group[])].sort((a, b) => a.name.localeCompare(b.name))
    for (const g of sorted) {
      const parentId = g.parentGroupId && groupIds.has(g.parentGroupId) ? g.parentGroupId : null
      if (!map.has(parentId)) map.set(parentId, [])
      map.get(parentId)!.push(g)
    }
    return map
  }, [groups])

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function renderFolder(group: Group, depth: number): React.ReactNode {
    const groupMembers = groupMembersMap.get(group.id) ?? []
    const children = (groupChildrenMap.get(group.id) ?? []) as Group[]
    if (groupMembers.length === 0 && children.length === 0) return null
    const expanded = expandedFolders.has(group.id)
    return (
      <div
        key={group.id}
        className={styles.folder}
        style={depth > 0 ? { marginLeft: `${depth * 16}px` } : undefined}
      >
        <div className={styles.folderHeaderRow}>
          <button
            className={styles.folderHeader}
            onClick={() => toggleFolder(group.id)}
            aria-expanded={expanded}
          >
            <span
              className={styles.folderColor}
              style={{ background: group.color ?? 'var(--color-muted)' }}
            />
            <span className={styles.folderName}>{group.name}</span>
            <span className={styles.folderCount}>{groupMembers.length}</span>
            <span className={styles.folderChevron}>{expanded ? '▾' : '▸'}</span>
          </button>
          <button
            className={styles.folderManageBtn}
            onClick={() => setGroupSheet({ open: true, group })}
            aria-label={`Manage ${group.name}`}
          >
            ···
          </button>
        </div>
        {expanded && (
          <div className={styles.folderMembers}>
            {children.map(child => renderFolder(child, depth + 1))}
            {groupMembers.map(m => (
              <MemberCard
                key={m.id}
                member={m}
                isFronting={frontingIds.has(m.id)}
                compact={density === 'compact'}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <span className="eyebrow">Your system</span>
        <h1 className="pageTitle">
          <span className="accentWord">Members</span>
        </h1>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="Search members…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Search members"
        />
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toggleGroup} role="group" aria-label="View mode">
          <button
            className={[styles.toggleBtn, mode === 'list' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setMode('list')}
            aria-pressed={mode === 'list'}
          >
            List
          </button>
          <button
            className={[styles.toggleBtn, mode === 'folder' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setMode('folder')}
            aria-pressed={mode === 'folder'}
          >
            Folder
          </button>
          <button
            className={[styles.toggleBtn, mode === 'map' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setMode('map')}
            aria-pressed={mode === 'map'}
          >
            Map
          </button>
        </div>
        <div className={styles.toggleGroup} role="group" aria-label="Display density">
          <button
            className={[styles.toggleBtn, density === 'card' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setDensity('card')}
            aria-pressed={density === 'card'}
          >
            Card
          </button>
          <button
            className={[styles.toggleBtn, density === 'compact' && styles.active].filter(Boolean).join(' ')}
            onClick={() => setDensity('compact')}
            aria-pressed={density === 'compact'}
          >
            Compact
          </button>
        </div>
        <button
          className={styles.addBtn}
          onClick={() => setShowCreate(true)}
          aria-label="Add member"
        >
          +
        </button>
      </div>

      {/* Content */}
      {mode === 'map' ? (
        <div className={styles.mapContent}>
          <SystemMap />
        </div>
      ) : mode === 'list' ? (
        <div className={styles.listWrapper}>
          <div className={styles.listContent}>
          {Array.from(alphabetGroups.entries()).map(([letter, letterMembers]) => (
            <div key={letter} id={`alpha-${letter}`}>
              <div className={styles.letterHeader}>{letter}</div>
              {letterMembers.map(m => (
                <MemberCard
                  key={m.id}
                  member={m}
                  isFronting={frontingIds.has(m.id)}
                  compact={density === 'compact'}
                />
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className={styles.empty}>{search ? 'No members match that search.' : 'No members yet. Tap + to add the first one.'}</p>
          )}
          </div>
          {alphabetGroups.size > 0 && (
            <nav className={styles.alphaRail} aria-label="Jump to letter">
              {Array.from(alphabetGroups.keys()).map(letter => (
                <button
                  key={letter}
                  className={styles.alphaBtn}
                  onClick={() => document.getElementById(`alpha-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  aria-label={`Jump to ${letter}`}
                >
                  {letter}
                </button>
              ))}
            </nav>
          )}
        </div>
      ) : (
        <div className={styles.folderContent}>
          <div className={styles.folderBar}>
            <span className={styles.folderBarLabel}>Groups</span>
            <button
              className={styles.newFolderBtn}
              onClick={() => setGroupSheet({ open: true, group: null })}
            >
              <Plus size={13} /> New group
            </button>
          </div>
          {(groupChildrenMap.get(null) ?? []).map(group => renderFolder(group, 0))}
          {(groups as Group[]).length === 0 && (
            <p className={styles.empty}>No groups yet.</p>
          )}
        </div>
      )}

      {showCreate && <CreateMemberSheet onClose={() => setShowCreate(false)} />}
      <GroupSheet
        isOpen={groupSheet.open}
        group={groupSheet.group}
        onClose={() => setGroupSheet({ open: false, group: null })}
      />
    </div>
  )
}
