import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fieldsApi } from '../../api/fields'
import BottomSheet from '../BottomSheet'
import type { Member, FieldDef } from '../../types'
import styles from './SpecsTab.module.css'
interface Props { member: Member }

const PRESETS = ['Role', 'Age', 'Interests', 'Triggers', 'Likes', 'Dislikes', 'Trauma', 'Strengths']

export default function SpecsTab({ member }: Props) {
  const qc = useQueryClient()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')

  const defsQuery = useQuery({ queryKey: ['field-defs'], queryFn: fieldsApi.listDefs })
  const valuesQuery = useQuery({ queryKey: ['member-fields', member.id], queryFn: () => fieldsApi.getMemberFields(member.id) })

  const upsertMutation = useMutation({
    mutationFn: ({ fieldId, value }: { fieldId: string; value: string }) =>
      fieldsApi.upsertMemberField(member.id, fieldId, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (fieldId: string) => fieldsApi.deleteMemberField(member.id, fieldId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['member-fields', member.id] }),
  })

  const addDefMutation = useMutation({
    mutationFn: (label: string) => fieldsApi.createDef(label),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['field-defs'] }),
  })

  const activeDefs = (defsQuery.data ?? []).filter((d: FieldDef) => d.deletedAt === null)
  const valueMap = new Map((valuesQuery.data ?? []).map(v => [v.fieldId, v]))

  async function handleAddField(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    let fieldId: string

    const existing = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      fieldId = existing.id
    } else {
      const created = await addDefMutation.mutateAsync(trimmed)
      fieldId = created.id
    }

    const alreadyHasValue = valueMap.has(fieldId)
    if (!alreadyHasValue) {
      await upsertMutation.mutateAsync({ fieldId, value: '' })
    }
    setSheetOpen(false)
    setCustomName('')
  }

  function startEdit(fieldId: string, currentValue: string) {
    setEditingFieldId(fieldId)
    setEditVal(currentValue)
  }

  function commitEdit(fieldId: string) {
    upsertMutation.mutate({ fieldId, value: editVal })
    setEditingFieldId(null)
  }

  if (defsQuery.isLoading || valuesQuery.isLoading)
    return <div role="status" className={styles.container}>Loading…</div>
  if (defsQuery.isError || valuesQuery.isError)
    return (
      <div className={styles.error}>
        Failed to load fields<br />
        <button className={styles.retryBtn} onClick={() => { defsQuery.refetch(); valuesQuery.refetch() }}>Retry</button>
      </div>
    )

  const memberDefIds = new Set((valuesQuery.data ?? []).map(v => v.fieldId))
  const displayedDefs = activeDefs

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span />
        <button className={styles.addBtn} onClick={() => setSheetOpen(true)} aria-label="Add spec"><Plus size={16} /></button>
      </div>

      {displayedDefs.length === 0 && <p className={styles.empty}>No specs defined yet. Use + to add the first one.</p>}

      {displayedDefs.map((def: FieldDef) => {
        const entry = valueMap.get(def.id)
        const isEditing = editingFieldId === def.id
        return (
          <div key={def.id} className={styles.fieldRow}>
            <span className={styles.fieldName}>{def.label}</span>
            {isEditing ? (
              <input
                className={styles.fieldInput}
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onBlur={() => commitEdit(def.id)}
                onKeyDown={e => e.key === 'Enter' && commitEdit(def.id)}
                autoFocus
              />
            ) : (
              <span
                className={`${styles.fieldValue} ${!entry?.value ? styles.placeholder : ''}`}
                onClick={() => startEdit(def.id, entry?.value ?? '')}
              >
                {entry?.value || 'Click to add…'}
              </span>
            )}
            <button className={styles.deleteIcon} onClick={() => deleteMutation.mutate(def.id)} aria-label={`Delete ${def.label}`}>🗑</button>
          </div>
        )
      })}

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Add Spec">
        <p className={styles.presetLabel}>Common fields</p>
        <div className={styles.presets}>
          {PRESETS.map(name => {
            const exists = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === name.toLowerCase())
            const alreadyAssigned = exists && memberDefIds.has(exists.id)
            return (
              <button
                key={name}
                className={`${styles.chip} ${alreadyAssigned ? styles.dimmed : ''}`}
                onClick={() => handleAddField(name)}
              >
                {name}
              </button>
            )
          })}
        </div>
        <p className={styles.customLabel}>Or define your own</p>
        <div className={styles.customRow}>
          <input
            className={styles.customInput}
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Field name…"
            onKeyDown={e => e.key === 'Enter' && handleAddField(customName)}
          />
          <button
            className={styles.customBtn}
            onClick={() => handleAddField(customName)}
            disabled={!customName.trim()}
          >
            Add
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
