import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import BottomSheet from '../BottomSheet'
import { relationshipsApi } from '../../api/relationships'

interface Props {
  isOpen: boolean
  fromMember: { id: string; name: string }
  toMember: { id: string; name: string }
  onClose: () => void
}

export function NewRelationshipSheet({ isOpen, fromMember, toMember, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [isDirected, setIsDirected] = useState(false)
  const qc = useQueryClient()

  const { mutate, isPending, error, reset } = useMutation({
    mutationFn: () =>
      relationshipsApi.create({
        fromMemberId: fromMember.id,
        toMemberId: toMember.id,
        label: label.trim(),
        isDirected,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['relationships'] })
      setLabel('')
      setIsDirected(false)
      onClose()
    },
  })

  function handleClose() {
    setLabel('')
    setIsDirected(false)
    reset()
    onClose()
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose} title="New Connection">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          New connection — {fromMember.name} → {toMember.name}
        </div>
        <p style={{ fontSize: 10, color: '#888' }}>A label is required to save (e.g. siblings, rivals, parent of)</p>
        <input
          style={{
            width: '100%',
            background: '#111',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '6px 10px',
            color: '#fff',
            fontSize: 12,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          placeholder="Label (e.g. siblings, parent of, rivals…)"
          maxLength={100}
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: 11, margin: '0' }}>
            {(error as Error).message?.includes('already exists')
              ? `A "${label.trim()}" connection already exists between these alters.`
              : 'Something went wrong. Please try again.'}
          </p>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setIsDirected(false)}
            style={{
              flex: 1,
              padding: '5px',
              borderRadius: 6,
              border: `1px solid ${!isDirected ? 'var(--color-primary)' : '#333'}`,
              background: !isDirected ? 'transparent' : '#1a1a1a',
              color: !isDirected ? 'var(--color-primary)' : '#666',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            — Undirected
          </button>
          <button
            onClick={() => setIsDirected(true)}
            style={{
              flex: 1,
              padding: '5px',
              borderRadius: 6,
              border: `1px solid ${isDirected ? 'var(--color-primary)' : '#333'}`,
              background: isDirected ? 'transparent' : '#1a1a1a',
              color: isDirected ? 'var(--color-primary)' : '#666',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            → Directed
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { reset(); mutate(); }}
            disabled={!label.trim() || isPending}
            style={{
              flex: 1,
              padding: 6,
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-primary)',
              color: '#000',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: label.trim() ? 'pointer' : 'not-allowed',
              opacity: label.trim() ? 1 : 0.4,
            }}
          >
            Save
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #333',
              background: 'transparent',
              color: '#666',
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
