import type { ReactNode } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import styles from './Drawer.module.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export default function Drawer({ isOpen, onClose, title, children }: Props) {
  const reduced = useReducedMotion()
  if (!isOpen) return null

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div
        className={[styles.drawer, styles.open, reduced ? styles.reduced : ''].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </>
  )
}
