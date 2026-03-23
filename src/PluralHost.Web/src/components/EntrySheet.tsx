import { useState, useEffect } from 'react'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import BottomSheet from './BottomSheet'
import { journalsApi } from '../api/journals'
import type { JournalEntry } from '../types'
import styles from './EntrySheet.module.css'

interface Props {
  entry: JournalEntry | null  // null = create new
  isOpen: boolean
  onClose: () => void
}

type Mode = 'view' | 'edit'

export default function EntrySheet({ entry, isOpen, onClose }: Props) {
  const qc = useQueryClient()
  const isNew = entry === null

  const [mode, setMode] = useState<Mode>(isNew ? 'edit' : 'view')
  const [title, setTitle] = useState(entry?.title ?? '')
  const [content, setContent] = useState(entry?.content ?? '')
  const [isPrivate, setIsPrivate] = useState(entry?.isPrivate ?? true)

  useEffect(() => {
    setMode(entry === null ? 'edit' : 'view')
    setTitle(entry?.title ?? '')
    setContent(entry?.content ?? '')
    setIsPrivate(entry?.isPrivate ?? true)
  }, [entry, isOpen])

  const createMutation = useMutation({
    mutationFn: () => journalsApi.create({ title: title.trim() || undefined, content, isPrivate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); onClose() },
  })

  const updateMutation = useMutation({
    mutationFn: () => journalsApi.update(entry!.id, { title: title.trim() || undefined, content, isPrivate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); setMode('view') },
  })

  const deleteMutation = useMutation({
    mutationFn: () => journalsApi.delete(entry!.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['journals'] }); onClose() },
  })

  function handleSave() {
    if (isNew) createMutation.mutate()
    else updateMutation.mutate()
  }

  function handleCancel() {
    if (isNew) { onClose() }
    else { setTitle(entry!.title ?? ''); setContent(entry!.content); setIsPrivate(entry!.isPrivate); setMode('view') }
  }

  const sheetTitle = isNew ? 'New Entry' : (entry?.title || 'Untitled')
  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={sheetTitle}>
      {mode === 'view' && entry && (
        <>
          <div className={styles.viewActions}>
            <button
              className={styles.editBtn}
              onClick={() => setMode('edit')}
              aria-label="Edit entry"
            >
              <Pencil size={14} /> Edit
            </button>
          </div>
          {entry.isPrivate && <div className={styles.privacyBadge}>🔒 Private</div>}
          <div className={styles.markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
          </div>
        </>
      )}

      {mode === 'edit' && (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="entry-title">Title (optional)</label>
            <input
              id="entry-title"
              className={styles.input}
              placeholder="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="entry-content">Content</label>
            <textarea
              id="entry-content"
              className={styles.textarea}
              placeholder="Content (markdown supported)"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
            />
            Private (hidden from share links)
          </label>
          <div className={styles.actions}>
            {!isNew && (
              <button
                className={styles.deleteBtn}
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                aria-label="Delete entry"
              >
                Delete
              </button>
            )}
            <button className={styles.cancelBtn} onClick={handleCancel}>Cancel</button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={!content.trim() || isSaving}
              aria-label="Save entry"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      )}
    </BottomSheet>
  )
}
