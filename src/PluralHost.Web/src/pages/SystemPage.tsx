import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import TabBar from '../components/TabBar'
import GroupSheet from '../components/GroupSheet'
import BucketSheet from '../components/BucketSheet'
import { groupsApi } from '../api/groups'
import { bucketsApi } from '../api/buckets'
import type { Group, PrivacyBucket } from '../types'
import styles from './SystemPage.module.css'

const TABS = ['Groups', 'Buckets'] as const
type Tab = typeof TABS[number]

export default function SystemPage() {
  const [tab, setTab] = useState<Tab>('Groups')
  const [groupSheet, setGroupSheet] = useState<{ open: boolean; group: Group | null }>({ open: false, group: null })
  const [bucketSheet, setBucketSheet] = useState<{ open: boolean; bucket: PrivacyBucket | null }>({ open: false, bucket: null })

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: buckets = [] } = useQuery({ queryKey: ['buckets'], queryFn: bucketsApi.list })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>System</h1>
        <button
          className={styles.addBtn}
          onClick={() =>
            tab === 'Groups'
              ? setGroupSheet({ open: true, group: null })
              : setBucketSheet({ open: true, bucket: null })
          }
          aria-label={`Add ${tab === 'Groups' ? 'group' : 'bucket'}`}
        >
          <Plus size={20} />
        </button>
      </header>

      <TabBar tabs={[...TABS]} active={tab} onChange={t => setTab(t as Tab)} />

      {tab === 'Groups' && (
        <section className={styles.list}>
          {groups.length === 0 && (
            <p className={styles.empty}>No groups yet. Tap + to create one.</p>
          )}
          {groups.map(g => (
            <button
              key={g.id}
              className={styles.card}
              onClick={() => setGroupSheet({ open: true, group: g })}
            >
              <span
                className={styles.colorDot}
                style={{ background: g.color ?? 'var(--color-primary)' }}
              />
              <span className={styles.cardName}>{g.name}</span>
              <span className={styles.cardCount}>{g.memberCount} member{g.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
        </section>
      )}

      {tab === 'Buckets' && (
        <section className={styles.list}>
          {buckets.map(b => (
            <button
              key={b.id}
              className={styles.card}
              onClick={() => setBucketSheet({ open: true, bucket: b })}
            >
              <span className={styles.emoji}>{b.emoji ?? '🪣'}</span>
              <span
                className={styles.colorBar}
                style={{ background: b.color ?? 'var(--color-primary)' }}
              />
              <span className={styles.cardName}>{b.name}</span>
              <span className={styles.cardCount}>{b.memberCount} member{b.memberCount !== 1 ? 's' : ''}</span>
            </button>
          ))}
          <p className={styles.futureNote}>Share token integration coming soon.</p>
        </section>
      )}

      <GroupSheet
        group={groupSheet.group}
        isOpen={groupSheet.open}
        onClose={() => setGroupSheet({ open: false, group: null })}
      />
      <BucketSheet
        bucket={bucketSheet.bucket}
        isOpen={bucketSheet.open}
        onClose={() => setBucketSheet({ open: false, bucket: null })}
      />
    </div>
  )
}
