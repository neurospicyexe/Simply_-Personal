import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import EntrySheet from '../components/EntrySheet'
import { journalsApi } from '../api/journals'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import type { JournalEntry, Member, SpEnvelope, FrontContent } from '../types'
import styles from './LogsPage.module.css'

const TABS = [
  { id: 'Journal', label: 'Journal' },
  { id: 'History', label: 'Front History' },
]

function formatDate(isoOrMs: string | number) {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export default function LogsPage() {
  const [activeTab, setActiveTab] = useState('Journal')
  const [searchTerm, setSearchTerm] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)

  const { data: journals = [] } = useQuery({
    queryKey: ['journals'],
    queryFn: journalsApi.list,
  })

  const { data: frontHistory = [] } = useQuery({
    queryKey: ['front-history'],
    queryFn: frontApi.history,
    enabled: activeTab === 'History',
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
    enabled: activeTab === 'History',
  })

  const memberMap = Object.fromEntries((members as Member[]).map(m => [m.id, m]))

  const filtered = journals.filter(e => {
    const q = searchTerm.toLowerCase()
    return (
      (e.title ?? '').toLowerCase().includes(q) ||
      e.content.toLowerCase().includes(q)
    )
  })

  function openNew() {
    setSelectedEntry(null)
    setSheetOpen(true)
  }

  function openEntry(entry: JournalEntry) {
    setSelectedEntry(entry)
    setSheetOpen(true)
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Logs</h1>
        {activeTab === 'Journal' && (
          <button className={styles.addBtn} onClick={openNew} aria-label="New entry">
            <Plus size={18} />
          </button>
        )}
      </div>

      <TabBar tabs={[...TABS]} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'Journal' && (
        <>
          <input
            className={styles.searchBar}
            placeholder="Search journal…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {filtered.length === 0 ? (
            <p className={styles.empty}>
              {searchTerm ? 'No entries match your search.' : 'No journal entries yet. Tap + to write something.'}
            </p>
          ) : (
            <div className={styles.list}>
              {filtered.map(entry => (
                <div key={entry.id} className={styles.card} onClick={() => openEntry(entry)}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardTitle}>{entry.title || 'Untitled'}</span>
                    <span className={styles.cardDate}>{formatDate(entry.createdAt)}</span>
                  </div>
                  {entry.isPrivate && <span className={styles.privacyBadge}>🔒 Private</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'History' && (
        <div>
          {(frontHistory as SpEnvelope<FrontContent>[])
            .slice()
            .sort((a, b) => b.content.startTime - a.content.startTime)
            .map(e => {
              const m = memberMap[e.content.member]
              return (
                <div key={e.content.uid} className={styles.historyCard}>
                  <div className={styles.historyMember}>{m?.name ?? e.content.member}</div>
                  <div className={styles.historyTime}>{formatDate(e.content.startTime)}</div>
                </div>
              )
            })}
          {frontHistory.length === 0 && (
            <p className={styles.empty}>No switches logged yet. Front changes will show up here.</p>
          )}
        </div>
      )}

      <EntrySheet
        entry={selectedEntry}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  )
}
