import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import { frontApi } from '../api/front'
import MemberCard from '../components/MemberCard'
import CreateMemberSheet from '../components/CreateMemberSheet'
import styles from './MembersPage.module.css'
import type { Member, SpEnvelope } from '../types'

type ViewMode = 'list' | 'folder'
type Density = 'card' | 'compact'

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<ViewMode>('list')
  const [density, setDensity] = useState<Density>('card')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [showCreate, setShowCreate] = useState(false)

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
      const letter = m.name[0].toUpperCase()
      if (!map.has(letter)) map.set(letter, [])
      map.get(letter)!.push(m)
    }
    return map
  }, [filtered])

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className={styles.page}>
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
      {mode === 'list' ? (
        <div className={styles.listContent}>
          {Array.from(alphabetGroups.entries()).map(([letter, letterMembers]) => (
            <div key={letter}>
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
            <p className={styles.empty}>No members found.</p>
          )}
        </div>
      ) : (
        <div className={styles.folderContent}>
          {groups.map(group => {
            const groupMembers = filtered.filter(m => m.parentIds.includes(group.id))
            if (groupMembers.length === 0) return null
            const expanded = expandedFolders.has(group.id)
            return (
              <div key={group.id} className={styles.folder}>
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
                {expanded && (
                  <div className={styles.folderMembers}>
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
          })}
          {groups.length === 0 && (
            <p className={styles.empty}>No groups yet.</p>
          )}
        </div>
      )}

      {showCreate && <CreateMemberSheet onClose={() => setShowCreate(false)} />}
    </div>
  )
}
