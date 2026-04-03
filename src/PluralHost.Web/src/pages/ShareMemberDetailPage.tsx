import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft } from 'lucide-react'
import Avatar from '../components/Avatar'
import { shareApi } from '../api/share'
import styles from './ShareMemberDetailPage.module.css'

const TABS = ['Essence', 'Specs', 'Comms', 'Logs'] as const
type Tab = typeof TABS[number]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  })
}

export default function ShareMemberDetailPage() {
  const { token, memberId } = useParams<{ token: string; memberId: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('Essence')

  const { data: shareData, isLoading: shareLoading } = useQuery({
    queryKey: ['share', token],
    queryFn: () => shareApi.get(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const { data: board = [], isLoading: boardLoading } = useQuery({
    queryKey: ['share-board', token, memberId],
    queryFn: () => shareApi.getBoard(token!, memberId!),
    enabled: !!token && !!memberId && activeTab === 'Comms',
  })

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['share-history', token, memberId],
    queryFn: () => shareApi.getHistory(token!, memberId!),
    enabled: !!token && !!memberId && activeTab === 'Logs',
  })

  const member = shareData?.members.find(m => m.id === memberId)

  if (shareLoading) return (
    <div className={styles.page}>
      <p className={styles.loading}>Loading…</p>
    </div>
  )

  if (shareData && !member) return (
    <div className={styles.page}>
      <Link to={`/view/${token}`} className={styles.backLink}>
        <ChevronLeft size={14} />
        Back to system view
      </Link>
      <p className={styles.notFound}>Member not found or not visible.</p>
    </div>
  )

  if (!member) return null

  return (
    <div className={styles.page}>
      <Link to={`/view/${token}`} className={styles.backLink}>
        <ChevronLeft size={14} />
        Back to system view
      </Link>

      <div className={styles.hero}>
        <Avatar
          name={member.displayName || member.name}
          color={member.color}
          avatarPath={member.avatarPath}
          size="lg"
        />
        <div className={styles.heroInfo}>
          <h1 className={styles.memberName}>{member.displayName || member.name}</h1>
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
        </div>
      </div>

      <div className={styles.tabBar}>
        {TABS.map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Essence' && (
        <div>
          {member.description
            ? <p className={styles.description}>{member.description}</p>
            : <p className={styles.empty}>No description.</p>
          }
        </div>
      )}

      {activeTab === 'Specs' && (
        <div>
          {member.customFields.length === 0
            ? <p className={styles.empty}>No fields to display.</p>
            : member.customFields.map((f, i) => (
              <div key={`${f.label}-${i}`} className={styles.fieldRow}>
                <span className={styles.fieldLabel}>{f.label}</span>
                <span className={styles.fieldValue}>{f.value}</span>
              </div>
            ))
          }
        </div>
      )}

      {activeTab === 'Comms' && (
        <div>
          {boardLoading
            ? <p className={styles.loading}>Loading messages…</p>
            : board.length === 0
              ? <p className={styles.empty}>No board messages.</p>
              : board.map(msg => (
                <div key={msg.id} className={styles.boardMessage}>
                  <div className={styles.messageAuthor}>
                    {msg.authorName} · {formatDate(msg.createdAt)}
                  </div>
                  <div className={styles.messageContent}>{msg.content}</div>
                </div>
              ))
          }
        </div>
      )}

      {activeTab === 'Logs' && (
        <div>
          {historyLoading
            ? <p className={styles.loading}>Loading history…</p>
            : history.length === 0
              ? <p className={styles.empty}>No front history.</p>
              : history.map((h, i) => (
                <div key={i} className={styles.historyRow}>
                  <div>
                    <div>{formatDate(h.frontStart)}</div>
                    <div className={styles.historyTime}>
                      {formatTime(h.frontStart)}
                      {h.frontEnd ? ` → ${formatTime(h.frontEnd)}` : ' (active)'}
                    </div>
                  </div>
                  {h.statusLabel && (
                    <span
                      className={styles.statusBadge}
                      style={{
                        color: h.statusColor ?? undefined,
                        borderColor: h.statusColor ?? undefined,
                      }}
                    >
                      {h.statusLabel}
                    </span>
                  )}
                </div>
              ))
          }
        </div>
      )}
    </div>
  )
}
