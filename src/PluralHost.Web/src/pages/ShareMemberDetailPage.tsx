import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Send } from 'lucide-react'
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
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('Essence')
  const [authorName, setAuthorName] = useState('')
  const [messageContent, setMessageContent] = useState('')
  const [postError, setPostError] = useState<string | null>(null)
  const [postSuccess, setPostSuccess] = useState(false)

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

  const postMutation = useMutation({
    mutationFn: () => {
      if (!authorName.trim() || !messageContent.trim()) throw new Error('Fields required')
      return shareApi.postBoard(token!, memberId!, {
        authorName: authorName.trim(),
        content: messageContent.trim(),
      })
    },
    onSuccess: () => {
      setMessageContent('')
      setPostError(null)
      setPostSuccess(true)
      setTimeout(() => setPostSuccess(false), 3000)
      qc.invalidateQueries({ queryKey: ['share-board', token, memberId] })
    },
    onError: (e: Error) => {
      setPostError(e.message === '403' ? 'Board posting is not enabled for this link.' : 'Failed to send. Try again.')
    },
  })

  const member = shareData?.members.find(m => m.id === memberId)
  const canPost = shareData?.canPost ?? false

  if (shareLoading) return (
    <div className={styles.page}>
      <p className={styles.loading}>Loading…</p>
    </div>
  )

  if (shareData && !member) return (
    <div className={styles.page}>
      <Link to={`/view/${token}`} className={styles.backLink}>
        <ChevronLeft size={14} /> Back to system view
      </Link>
      <p className={styles.notFound}>Member not found or not visible.</p>
    </div>
  )

  if (!member) return null

  const isFronting = (shareData?.currentFront ?? []).some(f => f.memberId === member.id)

  return (
    <div className={styles.page}>
      <Link to={`/view/${token}`} className={styles.backLink}>
        <ChevronLeft size={14} /> Back to system view
      </Link>

      <div className={styles.hero}>
        <Avatar
          name={member.displayName || member.name}
          color={member.color}
          avatarPath={member.avatarPath}
          isFronting={isFronting}
          size="lg"
        />
        <div className={styles.heroInfo}>
          <h1 className={styles.memberName}>{member.displayName || member.name}</h1>
          {member.displayName && member.displayName !== member.name && (
            <p className={styles.systemName}>{member.name}</p>
          )}
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
          {isFronting && <span className={styles.frontingBadge}>Fronting</span>}
        </div>
        {member.color && (
          <span
            className={styles.colorDot}
            style={{ '--member-color': member.color } as React.CSSProperties}
            aria-label="Member color"
          />
        )}
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
        <div className={styles.tabContent}>
          {member.description ? (
            <section className={styles.section}>
              <h3 className={styles.sectionHeader}>About</h3>
              <p className={styles.description}>{member.description}</p>
            </section>
          ) : (
            <p className={styles.empty}>No description.</p>
          )}
        </div>
      )}

      {activeTab === 'Specs' && (
        <div className={styles.tabContent}>
          {(member.customFields ?? []).length === 0 ? (
            <p className={styles.empty}>No fields to display.</p>
          ) : (
            <section className={styles.section}>
              <h3 className={styles.sectionHeader}>Fields</h3>
              {(member.customFields ?? []).map((f, i) => (
                <div key={`${f.label}-${i}`} className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{f.label}</span>
                  <span className={styles.fieldValue}>{f.value}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {activeTab === 'Comms' && (
        <div className={styles.tabContent}>
          {canPost && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeader}>Leave a message</h3>
              <div className={styles.postForm}>
                <input
                  className={styles.postInput}
                  placeholder="Your name"
                  value={authorName}
                  onChange={e => setAuthorName(e.target.value)}
                  maxLength={100}
                />
                <textarea
                  className={styles.postTextarea}
                  placeholder="Write a message…"
                  value={messageContent}
                  onChange={e => setMessageContent(e.target.value)}
                  maxLength={1000}
                  rows={3}
                />
                {postError && <p className={styles.postError}>{postError}</p>}
                {postSuccess && <p className={styles.postSuccess}>Message sent.</p>}
                <button
                  className={styles.postBtn}
                  onClick={() => postMutation.mutate()}
                  disabled={!authorName.trim() || !messageContent.trim() || postMutation.isPending}
                >
                  <Send size={14} />
                  {postMutation.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </section>
          )}

          <section className={styles.section}>
            <h3 className={styles.sectionHeader}>Messages</h3>
            {boardLoading ? (
              <p className={styles.loading}>Loading messages…</p>
            ) : board.length === 0 ? (
              <p className={styles.empty}>No messages yet.</p>
            ) : board.map(msg => (
              <div key={msg.id} className={styles.boardMessage}>
                <div className={styles.messageAuthor}>
                  {msg.authorName} · {formatDate(msg.createdAt)}
                </div>
                <div className={styles.messageContent}>{msg.content}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {activeTab === 'Logs' && (
        <div className={styles.tabContent}>
          <section className={styles.section}>
            <h3 className={styles.sectionHeader}>Front history</h3>
            {historyLoading ? (
              <p className={styles.loading}>Loading history…</p>
            ) : history.length === 0 ? (
              <p className={styles.empty}>No front history.</p>
            ) : history.map(h => (
              <div key={h.id} className={styles.historyRow}>
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
                    style={{ '--badge-color': h.statusColor ?? 'inherit' } as React.CSSProperties}
                  >
                    {h.statusLabel}
                  </span>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
