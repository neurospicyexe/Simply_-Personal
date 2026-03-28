import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '../../api/notes'
import { relationshipsApi } from '../../api/relationships'
import { membersApi } from '../../api/members'
import { NewRelationshipSheet } from '../SystemMap/NewRelationshipSheet'
import BottomSheet from '../BottomSheet'
import type { Member, MemberNote, MemberRelationship } from '../../types'
import styles from './DossierTab.module.css'

interface Props { member: Member }

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function DossierTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetNote, setSheetNote] = useState<MemberNote | null | undefined>(undefined) // undefined=closed, null=create
  const [titleVal, setTitleVal] = useState('')
  const [contentVal, setContentVal] = useState('')
  const [sheetError, setSheetError] = useState('')

  // Relationships
  const { data: allRelationships = [] } = useQuery({
    queryKey: ['relationships'],
    queryFn: relationshipsApi.list,
  })
  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const connections = (allRelationships as MemberRelationship[]).filter(
    r => r.fromMemberId === member.id || r.toMemberId === member.id
  )

  const [pickingTarget, setPickingTarget] = useState(false)
  const [targetMemberId, setTargetMemberId] = useState<string | null>(null)
  const [connectSheetOpen, setConnectSheetOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const deleteRelMutation = useMutation({
    mutationFn: (id: string) => relationshipsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['relationships'] }),
  })

  function getOtherMember(r: MemberRelationship) {
    const otherId = r.fromMemberId === member.id ? r.toMemberId : r.fromMemberId
    return (allMembers as any[]).find(m => m.id === otherId)
  }

  function directionLabel(r: MemberRelationship) {
    if (!r.isDirected) return '↔'
    return r.fromMemberId === member.id ? '→' : '←'
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['member-notes', member.id],
    queryFn: () => notesApi.list(member.id),
  })

  const createMutation = useMutation({
    mutationFn: () => notesApi.create(member.id, { title: titleVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-notes', member.id] }); closeSheet() },
    onError: (e: Error) => setSheetError(e.message),
  })

  const updateMutation = useMutation({
    mutationFn: () => notesApi.update(member.id, sheetNote!.id, { title: titleVal.trim(), content: contentVal.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['member-notes', member.id] }); closeSheet() },
    onError: (e: Error) => setSheetError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => notesApi.delete(member.id, noteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-notes', member.id] }),
  })

  function openCreate() { setSheetNote(null); setTitleVal(''); setContentVal(''); setSheetError('') }
  function openEdit(note: MemberNote) { setSheetNote(note); setTitleVal(note.title); setContentVal(note.content); setSheetError('') }
  function closeSheet() { setSheetNote(undefined) }

  function handleSave() {
    if (!titleVal.trim()) return
    sheetNote === null ? createMutation.mutate() : updateMutation.mutate()
  }

  function handleDelete(e: React.MouseEvent, noteId: string) {
    e.stopPropagation()
    if (!window.confirm('Delete this note?')) return
    deleteMutation.mutate(noteId)
  }

  if (isLoading) return <div role="status" className={styles.container}>Loading…</div>
  if (isError) return (
    <div className={styles.error}>
      Failed to load notes<br />
      <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
    </div>
  )

  const notes = [...(data ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={openCreate} aria-label="Add note"><Plus size={16} /></button>
      </div>

      {notes.length === 0 && <p className={styles.empty}>No notes yet. Use + to add the first one.</p>}

      {notes.map(note => (
        <div key={note.id} className={styles.card} onClick={() => openEdit(note)}>
          <div className={styles.cardHeader}>
            <p className={styles.noteTitle}>{note.title}</p>
            <button className={styles.deleteIcon} onClick={e => handleDelete(e, note.id)} aria-label="Delete note">🗑</button>
          </div>
          <p className={styles.noteContent}>{note.content}</p>
          <p className={styles.meta}>{relativeTime(note.updatedAt)}</p>
        </div>
      ))}

      {/* Connections */}
      <div className={styles.card} style={{ cursor: 'default' }}>
        <div className={styles.cardHeader}>
          <span className={styles.noteTitle}>Connections</span>
          <button className={styles.addBtn} style={{ width: 28, height: 28, fontSize: '0.85rem' }} onClick={() => setPickingTarget(true)}>
            <Plus size={16} />
          </button>
        </div>

        {pickingTarget && (
          <div style={{ marginBottom: 8 }}>
            <select
              autoFocus
              style={{
                width: '100%',
                background: '#111',
                border: '1px solid #333',
                color: '#fff',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 11,
                fontFamily: 'inherit',
              }}
              defaultValue=""
              onChange={e => {
                if (e.target.value) {
                  setTargetMemberId(e.target.value)
                  setPickingTarget(false)
                  setConnectSheetOpen(true)
                }
              }}
              onBlur={() => setPickingTarget(false)}
            >
              <option value="" disabled>Pick a member…</option>
              {(allMembers as any[])
                .filter(m => m.id !== member.id)
                .map(m => (
                  <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
                ))}
            </select>
          </div>
        )}

        {connections.length === 0 ? (
          <p className={styles.empty} style={{ padding: '12px 0' }}>No connections yet</p>
        ) : (
          <ul className={styles.connectionList}>
            {connections.map(r => {
              const other = getOtherMember(r)
              return (
                <li key={r.id} className={styles.connectionRow}>
                  <span className={styles.connectionDir}>{directionLabel(r)}</span>
                  <span className={styles.connectionName}>{other?.displayName || other?.name || 'Unknown'}</span>
                  <span className={styles.connectionLabel}>{r.label}</span>
                  {deleteConfirmId === r.id ? (
                    <div className={styles.confirmRow}>
                      <span style={{ fontSize: 10, color: '#888' }}>Delete?</span>
                      <button
                        className={styles.dangerBtn}
                        onClick={() => { deleteRelMutation.mutate(r.id); setDeleteConfirmId(null) }}
                      >Yes</button>
                      <button className={styles.cancelBtn} onClick={() => setDeleteConfirmId(null)}>No</button>
                    </div>
                  ) : (
                    <button
                      className={styles.deleteConnectionBtn}
                      onClick={() => setDeleteConfirmId(r.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {connectSheetOpen && targetMemberId && (() => {
        const currentMember = (allMembers as any[]).find(m => m.id === member.id)
        const targetMember = (allMembers as any[]).find(m => m.id === targetMemberId)
        return (
          <NewRelationshipSheet
            isOpen
            fromMember={{
              id: member.id,
              name: currentMember?.displayName || currentMember?.name || 'You',
            }}
            toMember={{
              id: targetMemberId,
              name: targetMember?.displayName || targetMember?.name || '',
            }}
            onClose={() => { setConnectSheetOpen(false); setTargetMemberId(null) }}
          />
        )
      })()}

      <BottomSheet
        isOpen={sheetNote !== undefined}
        onClose={closeSheet}
        title={sheetNote === null ? 'New Note' : 'Edit Note'}
      >
        <div className={styles.form}>
          <label className={styles.label}>
            Title *
            <input className={styles.input} value={titleVal} onChange={e => setTitleVal(e.target.value)} placeholder="Note title" autoFocus />
          </label>
          <label className={styles.label}>
            Content
            <textarea className={styles.textarea} value={contentVal} onChange={e => setContentVal(e.target.value)} placeholder="Write something…" />
          </label>
          {sheetError && <p className={styles.sheetError}>{sheetError}</p>}
          <div className={styles.actions}>
            <button className={styles.cancelBtn} onClick={closeSheet}>Cancel</button>
            <button className={styles.saveBtn} onClick={handleSave} disabled={isPending || !titleVal.trim()}>
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
