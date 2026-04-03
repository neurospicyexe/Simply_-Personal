import { useState, useEffect } from 'react'
import BottomSheet from './BottomSheet'
import type { FrontStatus } from '../api/frontStatuses'
import styles from './StatusPickerSheet.module.css'

interface StatusPickerSheetProps {
  isOpen: boolean
  currentStatus: string
  statuses: FrontStatus[]
  onSelect: (value: string) => void
  onClose: () => void
}

export default function StatusPickerSheet({
  isOpen,
  currentStatus,
  statuses,
  onSelect,
  onClose,
}: StatusPickerSheetProps) {
  const visible = statuses.filter(s => !s.isHidden)
  const isCustom = currentStatus !== '' && !visible.some(s => s.label === currentStatus)
  const [freetext, setFreetext] = useState(isCustom ? currentStatus : '')

  useEffect(() => {
    if (isOpen) setFreetext(isCustom ? currentStatus : '')
  }, [isOpen, currentStatus])

  const handleSelect = (value: string) => {
    onSelect(value)
    onClose()
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Set Status">
      <div className={styles.list}>
        <button
          className={[styles.item, currentStatus === '' ? styles.active : ''].filter(Boolean).join(' ')}
          onClick={() => handleSelect('')}
        >
          <span className={styles.dot} style={{ background: 'var(--color-border)' }} />
          <span className={styles.label}>None</span>
        </button>

        {visible.map(s => (
          <button
            key={s.id}
            className={[styles.item, currentStatus === s.label ? styles.active : ''].filter(Boolean).join(' ')}
            onClick={() => handleSelect(s.label)}
          >
            <span className={styles.dot} style={{ background: s.color ?? 'var(--color-muted)' }} />
            <span className={styles.label}>{s.label}</span>
          </button>
        ))}

        <hr className={styles.divider} />

        <div className={styles.freetextRow}>
          <input
            className={styles.freetextInput}
            placeholder="or type a custom status…"
            value={freetext}
            onChange={e => setFreetext(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && freetext.trim() && handleSelect(freetext.trim())}
            aria-label="Custom status"
          />
          <button
            className={styles.setBtn}
            onClick={() => freetext.trim() && handleSelect(freetext.trim())}
            disabled={!freetext.trim()}
          >
            Set
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
