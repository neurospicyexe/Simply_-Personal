import styles from './Avatar.module.css'

interface AvatarProps {
  name: string
  color?: string
  avatarPath?: string
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
  const style = { '--member-color': color } as React.CSSProperties
  const cls = [styles.avatar, styles[size], isFronting && styles.fronting]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={style} aria-label={name}>
      {avatarPath ? (
        <img src={avatarPath} alt={name} className={styles.img} />
      ) : (
        <span className={styles.initial}>{name[0]?.toUpperCase()}</span>
      )}
    </div>
  )
}
