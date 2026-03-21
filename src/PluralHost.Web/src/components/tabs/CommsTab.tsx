import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { boardApi } from '../../api/board'
import BottomSheet from '../BottomSheet'
import type { Member } from '../../types'
import styles from './CommsTab.module.css'

interface BoardMessage {
  id: string; memberId: string; authorName: string; content: string; createdAt: string
}

interface Props { member: Member }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function CommsTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [authorVal, setAuthorVal] = useState('')
  const [contentVal, setContentVal] = useState('')
  const [sheetError, setSheetError] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['member-board', member.id],
    queryFn: () => boardApi.list(member.id),
  })

  const postMutation = useMutation({
    mutationFn: () => boardApi.post(member.id, { authorName: authorVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-board', member.id] }); setSheetOpen(false) },
    onError: (e: Error) => setSheetError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (msgId: string) => boardApi.delete(member.id, msgId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-board', member.id] }),
  })

  function openSheet() { setAuthorVal(''); setContentVal(''); setSheetError(''); setSheetOpen(true) }
  const canPost = authorVal.trim().length > 0 && contentVal.trim().length > 0

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load messages<br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const messages = [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={openSheet} aria-label="Post message">+</button>
      </div>

      {messages.length === 0 && <p className={styles.empty}>No messages yet.</p>}

      {messages.map(msg => (
        <div key={msg.id} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.author}>{msg.authorName}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={styles.meta}>{relativeTime(msg.createdAt)}</span>
              <button className={styles.deleteIcon} onClick={() => deleteMutation.mutate(msg.id)} aria-label="Delete message">🗑</button>
            </div>
          </div>
          <p className={styles.content}>{msg.content}</p>
        </div>
      ))}

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="New Message">
        <div className={styles.form}>
          <label className={styles.label}>
            Author *
            <input className={styles.input} value={authorVal} onChange={e => setAuthorVal(e.target.value)} placeholder="Who is posting?" autoFocus />
          </label>
          <label className={styles.label}>
            Message *
            <textarea className={styles.textarea} value={contentVal} onChange={e => setContentVal(e.target.value)} placeholder="Write a message…" />
          </label>
          {sheetError && <p className={styles.sheetError}>{sheetError}</p>}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={() => setSheetOpen(false)}>Cancel</button>
            <button className={styles.postBtn} onClick={() => postMutation.mutate()} disabled={postMutation.isPending || !canPost}>
              {postMutation.isPending ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
