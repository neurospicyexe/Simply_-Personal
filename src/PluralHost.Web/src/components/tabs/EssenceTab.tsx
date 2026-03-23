import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { mediaApi } from '../../api/media'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../../api/members'
import type { Member, Group, MemberUpdatePayload } from '../../types'
import styles from './EssenceTab.module.css'

interface Props {
  member: Member
  groups: Group[]
}

interface EditableFieldProps {
  label: string
  value: string
  fieldKey: string
  editField: string | null
  editValues: Record<string, string>
  onStartEdit: (field: string, current: string) => void
  onSave: () => void
  onCancel: () => void
  onEditChange: (v: string) => void
  multiline?: boolean
}

function EditableField({
  label, value, fieldKey, editField, editValues,
  onStartEdit, onSave, onCancel, onEditChange, multiline,
}: EditableFieldProps) {
  const isEditing = editField === fieldKey

  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {isEditing ? (
        <div className={styles.editRow}>
          {multiline ? (
            <textarea
              className={styles.textarea}
              value={editValues[fieldKey] ?? ''}
              onChange={e => onEditChange(e.target.value)}
              autoFocus
              aria-label={label}
            />
          ) : (
            <input
              className={styles.input}
              value={editValues[fieldKey] ?? ''}
              onChange={e => onEditChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
              autoFocus
              aria-label={label}
            />
          )}
          <div className={styles.editBtns}>
            <button className={styles.saveBtn} onClick={onSave} aria-label={`Save ${label}`}>Save</button>
            <button className={styles.cancelBtn} onClick={onCancel} aria-label="Cancel">Cancel</button>
          </div>
        </div>
      ) : (
        <button
          className={styles.fieldValue}
          onClick={() => onStartEdit(fieldKey, value)}
          aria-label={`Edit ${label}`}
        >
          {value || <span className={styles.fieldEmpty}>Tap to edit…</span>}
        </button>
      )}
    </div>
  )
}

export default function EssenceTab({ member, groups }: Props) {
  const qc = useQueryClient()
  const [editField, setEditField] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  const updateMutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(member.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', member.id] })
      qc.invalidateQueries({ queryKey: ['members'] })
      setEditField(null)
    },
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const previousAvatarPath = member.avatarPath ?? null
    setUploading(true)
    setUploadError(null)
    try {
      const { id } = await mediaApi.upload(file)
      await membersApi.update(member.id, { avatarPath: id })
      qc.invalidateQueries({ queryKey: ['member', member.id] })
    } catch {
      await membersApi.update(member.id, { avatarPath: previousAvatarPath ?? undefined }).catch(() => {})
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const startEdit = (field: string, current: string) => {
    setEditField(field)
    setEditValues(v => ({ ...v, [field]: current }))
  }

  const saveField = (field: string, key: keyof MemberUpdatePayload) => {
    updateMutation.mutate({ [key]: editValues[field] } as MemberUpdatePayload)
  }

  const cancelEdit = () => setEditField(null)

  return (
    <div className={styles.tab} role="tabpanel">
      <div className={styles.avatarSection}>
        <div className={styles.avatarWrap}>
          <div
            className={styles.avatarCircle}
            style={{ background: member.color ?? '#555' }}
          >
            {member.avatarPath
              ? <img src={`/api/media/${member.avatarPath}`} alt={member.name} className={styles.avatarImg} />
              : <span className={styles.avatarInitial}>{member.name[0]?.toUpperCase()}</span>
            }
          </div>
          {uploading && <div className={styles.avatarSpinner} aria-label="Uploading…" />}
          <button
            className={styles.avatarPencil}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Change avatar"
            disabled={uploading}
            type="button"
          >
            <Pencil size={8} strokeWidth={2.5} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.avatarInput}
            onChange={handleFileChange}
          />
        </div>
        {uploadError && <p className={styles.uploadError} role="alert">{uploadError}</p>}
      </div>
      <EditableField
        label="Name"
        value={member.name}
        fieldKey="name"
        editField={editField}
        editValues={editValues}
        onStartEdit={startEdit}
        onSave={() => saveField('name', 'name')}
        onCancel={cancelEdit}
        onEditChange={(v) => setEditValues(ev => ({ ...ev, name: v }))}
      />

      <EditableField
        label="Display Name"
        value={member.displayName ?? ''}
        fieldKey="displayName"
        editField={editField}
        editValues={editValues}
        onStartEdit={startEdit}
        onSave={() => saveField('displayName', 'displayName')}
        onCancel={cancelEdit}
        onEditChange={(v) => setEditValues(ev => ({ ...ev, displayName: v }))}
      />

      <EditableField
        label="Pronouns"
        value={member.pronouns ?? ''}
        fieldKey="pronouns"
        editField={editField}
        editValues={editValues}
        onStartEdit={startEdit}
        onSave={() => saveField('pronouns', 'pronouns')}
        onCancel={cancelEdit}
        onEditChange={(v) => setEditValues(ev => ({ ...ev, pronouns: v }))}
      />

      <EditableField
        label="Description"
        value={member.description ?? ''}
        fieldKey="description"
        editField={editField}
        editValues={editValues}
        onStartEdit={startEdit}
        onSave={() => saveField('description', 'description')}
        onCancel={cancelEdit}
        onEditChange={(v) => setEditValues(ev => ({ ...ev, description: v }))}
        multiline
      />

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Color</span>
        <div className={styles.colorRow}>
          <span
            className={styles.colorSwatch}
            style={{ background: member.color ?? '#888' }}
            aria-label={`Color: ${member.color ?? 'none'}`}
          />
          <input
            type="color"
            className={styles.colorInput}
            value={member.color ?? '#888888'}
            onChange={e => updateMutation.mutate({ color: e.target.value })}
            aria-label="Pick member color"
          />
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Groups</span>
        <div className={styles.groupChips}>
          {groups.map(group => (
            <span
              key={group.id}
              className={[
                styles.chip,
                member.parentIds.includes(group.id) && styles.chipActive,
              ].filter(Boolean).join(' ')}
            >
              {group.name}
            </span>
          ))}
          {groups.length === 0 && (
            <span className={styles.fieldEmpty}>No groups yet</span>
          )}
        </div>
      </div>
    </div>
  )
}
