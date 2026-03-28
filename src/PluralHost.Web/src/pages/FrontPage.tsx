import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import FrontCard from '../components/FrontCard'
import HeatmapStrip from '../components/HeatmapStrip'
import styles from './FrontPage.module.css'
import type { Member } from '../types'

export default function FrontPage() {
  const qc = useQueryClient()
  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const { data: fronters = [] } = useQuery({
    queryKey: ['fronters'],
    queryFn: frontApi.getCurrent,
    refetchInterval: 30_000,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  // Build member lookup map
  const memberMap = useMemo(() => Object.fromEntries(members.map((m: Member) => [m.id, m])), [members])

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

  const addMutation = useMutation({
    mutationFn: (memberId: string) =>
      frontApi.create({ member: memberId, live: true, startTime: Date.now() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['fronters'] }); setShowPicker(false) },
  })

  const filteredMembers = members.filter((m: Member) =>
    m.name.toLowerCase().includes(pickerSearch.toLowerCase())
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
              onRemove={uid => removeMutation.mutate(uid)}
              onUpdateStatus={(uid, status) => updateStatusMutation.mutate({ uid, status })}
              onEdit={(uid, memberId, startTime) => editMutation.mutate({ uid, memberId, startTime })}
            />
          )
        })}
        {fronters.length === 0 && (
          <p className={styles.empty}>Nobody is fronting right now.</p>
        )}
      </div>

      {/* 24h history strip */}
      <HeatmapStrip />
    </div>
  )
}
