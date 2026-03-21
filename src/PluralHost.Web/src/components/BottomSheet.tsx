import type { ReactNode } from 'react'
import styles from './BottomSheet.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function BottomSheet({ isOpen, onClose, title, children }: Props) {
  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.handle} />
        <h2 className={styles.title}>{title}</h2>
        {children}
      </div>
    </div>
  )
}
