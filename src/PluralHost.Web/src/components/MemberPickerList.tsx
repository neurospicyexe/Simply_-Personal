import { useState } from 'react'
import type { Member } from '../types'
import styles from './MemberPickerList.module.css'

interface Props {
  members: Member[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

export default function MemberPickerList({ members, selectedIds, onToggle }: Props) {
  const [search, setSearch] = useState('')

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.displayName?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className={styles.container}>
      <input
        className={styles.search}
        type="search"
        placeholder="Search members…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        aria-label="Filter members"
      />
      <ul className={styles.list} role="listbox" aria-multiselectable="true">
        {filtered.map(m => {
          const selected = selectedIds.includes(m.id)
          return (
            <li
              key={m.id}
              role="option"
              aria-selected={selected}
              className={[styles.item, selected && styles.selected].filter(Boolean).join(' ')}
              onClick={() => onToggle(m.id)}
              style={{ borderLeftColor: m.color ?? 'var(--color-primary)' }}
            >
              <span className={styles.name}>{m.displayName ?? m.name}</span>
              {selected && <span className={styles.check} aria-hidden="true">✓</span>}
            </li>
          )
        })}
        {filtered.length === 0 && (
          <li className={styles.empty}>No members match.</li>
        )}
      </ul>
    </div>
  )
}
