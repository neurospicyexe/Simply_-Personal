import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { GroupNodeV2Data } from '../../hooks/useMapLayout'
import styles from './GroupNodeV2.module.css'

export type GroupNodeV2Type = Node<GroupNodeV2Data, 'groupV2'>

export function GroupNodeV2({ data, selected }: NodeProps<GroupNodeV2Type>) {
  const color = data.color ?? '#666'
  return (
    <div
      className={[styles.node, selected && styles.selected].filter(Boolean).join(' ')}
      style={{ '--group-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Bottom} className={styles.handle} id="target" />
      <span className={styles.name}>{data.name}</span>
      <span className={styles.badge}>{data.memberCount}</span>
    </div>
  )
}
