import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import { frontStatusesApi } from '../api/frontStatuses'
import { bucketsApi } from '../api/buckets'
import type { PrivacyBucket } from '../types'
import FrontCard from '../components/FrontCard'
import HeatmapStrip from '../components/HeatmapStrip'
import styles from './FrontPage.module.css'
import type { Member } from '../types'

export default function FrontPage() {
  const qc = useQueryClient()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const { data: fronters = [] } = useQuery({
    queryKey: ['fronters'],
    queryFn: frontApi.getCurrent,
    refetchInterval: 30_000,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const { data: frontStatuses = [] } = useQuery({
    queryKey: ['front-statuses'],
    queryFn: frontStatusesApi.list,
  })

  const { data: buckets = [] } = useQuery({
    queryKey: ['buckets'],
    queryFn: bucketsApi.list,
  })

  // bucketMap passed to FrontCard in Task 8 (bucket chip)
  const bucketMap = useMemo(
    () => Object.fromEntries((buckets as PrivacyBucket[]).map(b => [b.id, b])),
    [buckets]
  )

  // Build member lookup map
  const memberMap = useMemo(() => Object.fromEntries(members.map((m: Member) => [m.id, m])), [members])

  const frontingIds = useMemo(() => new Set((fronters as any[]).map((f: any) => f.member)), [fronters])

  const removeMutation = useMutation({
    mutationFn: (uid: string) => frontApi.delete(uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ uid, status }: { uid: string; status: string }) =>
      frontApi.update(uid, { customStatus: status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const editMutation = useMutation({
    mutationFn: ({ uid, memberId, startTime }: { uid: string; memberId: string; startTime: number }) =>
      frontApi.update(uid, { memberId, startTime }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const updateCommentMutation = useMutation({
    mutationFn: ({ uid, comment }: { uid: string; comment: string }) =>
      frontApi.update(uid, { comment }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const clearAllMutation = useMutation({
    mutationFn: frontApi.clearAll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fronters'] })
      setShowClearConfirm(false)
    },
  })

  const addMutation = useMutation({
    mutationFn: (memberId: string) =>
      frontApi.create({ member: memberId, live: true, startTime: Date.now() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fronters'] }); setShowPicker(false) },
  })

  const filteredMembers = members.filter((m: Member) =>
    m.name.toLowerCase().includes(pickerSearch.toLowerCase()) && !frontingIds.has(m.id)
  )

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className="eyebrow">Right now</span>
          <h1 className="pageTitle">
            <span className="accentWord">Fronting</span>
          </h1>
        </div>
        <button
          className={styles.addBtn}
          onClick={() => setShowPicker(s => !s)}
          aria-label="Add fronter"
        >
          + Add Fronter
        </button>
        {(fronters as any[]).length > 0 && (
          <button
            className={styles.clearBtn}
            onClick={() => setShowClearConfirm(true)}
            aria-label="Remove all from front"
          >
            Clear All
          </button>
        )}
      </div>

      {showPicker && (
        <div className={styles.picker} role="dialog" aria-label="Select member to add">
          <input
            className={styles.pickerSearch}
            placeholder="Search members…"
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            autoFocus
            aria-label="Search members"
          />
          <div className={styles.pickerList}>
            {filteredMembers.map((m: Member) => (
              <button
                key={m.id}
                className={styles.pickerItem}
                onClick={() => addMutation.mutate(m.id)}
              >
                {m.name}
                {m.pronouns && <span className={styles.pickerPronouns}>{m.pronouns}</span>}
              </button>
            ))}
            {filteredMembers.length === 0 && (
              <p className={styles.pickerEmpty}>No members found</p>
            )}
          </div>
        </div>
      )}

      <div className={styles.cards}>
        {fronters.map(envelope => {
          const member = memberMap[envelope.content.member]
          if (!member) return null
          return (
            <FrontCard
              key={envelope.id}
              entry={envelope.content}
              member={member}
              frontStatuses={frontStatuses}
              bucket={bucketMap[member.bucketId]}
              onRemove={() => removeMutation.mutate(envelope.id)}
              onUpdateStatus={(_, status) => updateStatusMutation.mutate({ uid: envelope.id, status })}
              onEdit={(_, memberId, startTime) => editMutation.mutate({ uid: envelope.id, memberId, startTime })}
              onUpdateComment={(_, comment) => updateCommentMutation.mutate({ uid: envelope.id, comment })}
            />
          )
        })}
        {fronters.length === 0 && (
          <p className={styles.empty}>Nobody is fronting right now.</p>
        )}
      </div>

      {/* 24h history strip */}
      <HeatmapStrip />

      {showClearConfirm && (
        <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-label="Confirm clear all">
          <div className={styles.confirmBox}>
            <p className={styles.confirmMsg}>Remove everyone from front?</p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => setShowClearConfirm(false)}>Cancel</button>
              <button
                className={styles.confirmDanger}
                onClick={() => clearAllMutation.mutate()}
                disabled={clearAllMutation.isPending}
              >
                {clearAllMutation.isPending ? 'Clearing…' : 'Yes, clear all'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
