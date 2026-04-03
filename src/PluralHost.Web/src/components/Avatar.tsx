import { useState } from 'react'
import styles from './Avatar.module.css'

interface AvatarProps {
  name: string
  color?: string
  avatarPath?: string | null
  isFronting?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function Avatar({
  name,
  color = '#888',
  avatarPath,
  isFronting = false,
  size = 'md',
}: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const style = { '--member-color': color } as React.CSSProperties
  const cls = [styles.avatar, styles[size], isFronting && styles.fronting]
    .filter(Boolean)
    .join(' ')

  const firstChar = ([...name][0] ?? '').toUpperCase()

  return (
    <div className={cls} style={style} aria-label={name}>
      {avatarPath && !imgFailed ? (
        <img src={avatarPath} alt={name} className={styles.img} onError={() => setImgFailed(true)} />
      ) : (
        <span className={styles.initial}>{firstChar}</span>
      )}
    </div>
  )
}
