import { Handle, Position, useViewport, type NodeProps, type Node } from '@xyflow/react'
import type { MemberNodeV2Data } from '../../hooks/useMapLayout'
import styles from './MemberNodeV2.module.css'

export type MemberNodeV2Type = Node<MemberNodeV2Data, 'memberV2'>

export function MemberNodeV2({ data, selected }: NodeProps<MemberNodeV2Type>) {
  const { zoom } = useViewport()
  const color = data.color ?? 'var(--color-primary)'
  const initial = (data.name[0] ?? '?').toUpperCase()

  return (
    <div
      className={[
        styles.node,
        data.isFronting && styles.fronting,
        data.isIsolated && styles.isolated,
        selected && styles.selected,
      ].filter(Boolean).join(' ')}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Top} className={styles.handle} id="target" />
      <div className={styles.circle}>
        <span className={styles.initial}>{initial}</span>
      </div>
      <span className={styles.name}>{data.name}</span>
      {zoom >= 0.5 && data.pronouns && (
        <span className={styles.pronouns}>{data.pronouns}</span>
      )}
    </div>
  )
}
