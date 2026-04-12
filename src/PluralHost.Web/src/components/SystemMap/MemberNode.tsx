import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import styles from './SystemMap.module.css'

export type MemberNodeData = {
  id: string
  name: string
  color?: string
  isFronting: boolean
  isIsolated: boolean
}

export type MemberNodeType = Node<MemberNodeData, 'member'>

export function MemberNode({ data }: NodeProps<MemberNodeType>) {
  const color = data.color ?? 'var(--color-primary)'
  const cls = [
    styles.memberNode,
    data.isFronting ? styles.fronting : '',
    data.isIsolated ? styles.isolated : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} className={styles.handle} id="target" />
      <div className={styles.memberCircle} />
      <span className={styles.memberLabel}>{data.name}</span>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </div>
  )
}
