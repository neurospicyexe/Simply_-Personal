import { useState, useRef, useEffect } from 'react'
import type { Member, Group } from '../../types'
import type { MapMode, ViewFilter } from '../../hooks/useMapLayout'
import styles from './FloatingToolbar.module.css'

interface Props {
  mode: MapMode
  onModeChange: (m: MapMode) => void
  viewFilter: ViewFilter
  onFilterChange: (f: ViewFilter) => void
  members: Member[]
  groups: Group[]
  onAdd: () => void
  onFitView: () => void
}

const MODES: { id: MapMode; label: string }[] = [
  { id: 'groups', label: 'Groups' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'both', label: 'Both' },
]

export function FloatingToolbar({
  mode, onModeChange, viewFilter, onFilterChange, members, groups, onAdd, onFitView,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  const isFiltered = viewFilter.type !== 'all'
  const filterLabel = viewFilter.type === 'group'
    ? `${viewFilter.name}`
    : viewFilter.type === 'member'
    ? `${viewFilter.name}'s connections`
    : 'All'

  const filteredGroups = groups.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredMembers = members.filter(m =>
    (m.displayName || m.name).toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.toolbar}>
      {/* Viewing picker / breadcrumb */}
      <div className={styles.viewingSection}>
        {isFiltered ? (
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbText}>{filterLabel}</span>
            <button
              className={styles.clearBtn}
              onClick={() => onFilterChange({ type: 'all' })}
              aria-label="Clear filter"
            >✕</button>
          </div>
        ) : (
          <div className={styles.viewingWrapper} ref={wrapperRef}>
            <button
              className={styles.viewingBtn}
              onClick={() => { setPickerOpen(p => !p); if (pickerOpen) setSearch('') }}
              aria-expanded={pickerOpen}
            >
              Viewing: All ▾
            </button>
            {pickerOpen && (
              <div className={styles.picker}>
                <input
                  className={styles.pickerSearch}
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  aria-label="Search groups and members"
                />
                {filteredGroups.length > 0 && (
                  <>
                    <div className={styles.pickerSection}>Groups</div>
                    {filteredGroups.map(g => (
                      <button
                        key={g.id}
                        className={styles.pickerItem}
                        onClick={() => {
                          onFilterChange({ type: 'group', id: g.id, name: g.name })
                          setPickerOpen(false)
                          setSearch('')
                        }}
                      >
                        {g.name}
                      </button>
                    ))}
                  </>
                )}
                {filteredMembers.length > 0 && (
                  <>
                    <div className={styles.pickerSection}>Members</div>
                    {filteredMembers.map(m => {
                      const name = m.displayName || m.name
                      return (
                        <button
                          key={m.id}
                          className={styles.pickerItem}
                          onClick={() => {
                            onFilterChange({ type: 'member', id: m.id, name })
                            setPickerOpen(false)
                            setSearch('')
                          }}
                        >
                          {name}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mode chips */}
      <div className={styles.modeChips}>
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            className={[styles.chip, mode === id && styles.active].filter(Boolean).join(' ')}
            onClick={() => onModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={onAdd} aria-label="Add relationship">⊕</button>
        <button className={styles.actionBtn} onClick={onFitView} aria-label="Fit view">⤢</button>
      </div>
    </div>
  )
}
