import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { notesApi } from '../../api/notes'
import BottomSheet from '../BottomSheet'
import type { Member, MemberNote } from '../../types'
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
