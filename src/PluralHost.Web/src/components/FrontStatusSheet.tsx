import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from './BottomSheet'
import { frontStatusesApi } from '../api/frontStatuses'
import type { FrontStatus } from '../api/frontStatuses'

interface Props {
  status: FrontStatus | null   // null = create mode
  isOpen: boolean
  onClose: () => void
  onDeleteRequest: (id: string) => void  // parent handles PIN confirmation
}

const COLOR_SWATCHES = [
  '#7c3aed', '#0ea5e9', '#f59e0b', '#10b981',
  '#f87171', '#ff4db8', '#b6ff00', '#00d4ff',
  '#b400ff', '#64748b',
]

export default function FrontStatusSheet({ status, isOpen, onClose, onDeleteRequest }: Props) {
  const qc = useQueryClient()
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [isHidden, setIsHidden] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setLabel(status?.label ?? '')
      setColor(status?.color ?? null)
      setIsHidden(status?.isHidden ?? false)
    }
  }, [isOpen, status])

  const createMutation = useMutation({
    mutationFn: () => frontStatusesApi.create(label.trim(), color),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-statuses'] })
      onClose()
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => frontStatusesApi.update(status!.id, {
      label: label.trim(),
      color,
      isHidden,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['front-statuses'] })
      onClose()
    },
  })

  const isCreate = status === null
  const isDirty = isCreate
    ? label.trim().length > 0
    : label.trim() !== status.label || color !== status.color || isHidden !== status.isHidden

  function handleSave() {
    if (!label.trim()) return
    if (isCreate) createMutation.mutate()
    else updateMutation.mutate()
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isCreate ? 'New Status' : 'Edit Status'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Status name…"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: '8px', padding: '8px 10px',
              color: 'var(--color-text)', fontSize: '14px',
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {COLOR_SWATCHES.map(c => (
              <button
                key={c}
                onClick={() => setColor(c === color ? null : c)}
                aria-label={c}
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: c, border: 'none', cursor: 'pointer',
                  outline: color === c ? '2px solid var(--color-primary)' : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
            <button
              onClick={() => setColor(null)}
              style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                cursor: 'pointer', fontSize: '12px', color: '#888',
                outline: color === null ? '2px solid var(--color-primary)' : 'none',
                outlineOffset: '2px',
              }}
              aria-label="No color"
            >✕</button>
          </div>
        </div>

        {!isCreate && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', color: 'var(--color-text)' }}>
              Hidden — exclude from front logging
            </label>
            <button
              role="switch"
              aria-checked={isHidden}
              onClick={() => setIsHidden(v => !v)}
              style={{
                width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                background: isHidden ? 'var(--color-primary)' : 'var(--color-border)',
                cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: isHidden ? '21px' : '3px',
                width: '16px', height: '16px', borderRadius: '50%',
                background: isHidden ? '#000' : '#888',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        )}

        {status?.isDefault && (
          <p style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', margin: 0 }}>
            Default statuses cannot be deleted — only hidden.
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handleSave}
            disabled={!label.trim() || !isDirty || isPending}
            style={{
              background: 'var(--color-primary)', color: '#000',
              border: 'none', borderRadius: '8px', padding: '10px',
              fontWeight: 700, cursor: 'pointer', opacity: (!label.trim() || !isDirty || isPending) ? 0.5 : 1,
            }}
          >
            {isPending ? 'Saving…' : isCreate ? 'Create' : 'Save'}
          </button>

          {!isCreate && !status?.isDefault && (
            <button
              onClick={() => onDeleteRequest(status!.id)}
              style={{
                background: 'none', border: '1px solid var(--color-danger)',
                borderRadius: '8px', padding: '10px',
                color: 'var(--color-danger)', cursor: 'pointer', fontWeight: 600,
              }}
            >
              Delete Status
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  )
}
