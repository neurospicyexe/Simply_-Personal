import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import styles from './SystemMap.module.css'

export type GroupNodeData = {
  name: string
  color?: string
  memberNodeIds: string[]
}

export type GroupNodeType = Node<GroupNodeData, 'group'>

export function GroupNode({ data }: NodeProps<GroupNodeType>) {
  const color = data.color ?? '#666'

  return (
    <div
      className={styles.groupNode}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
      <Handle type="target" position={Position.Bottom} className={styles.handle} id="target" />
      <span className={styles.groupLabel}>{data.name}</span>
    </div>
  )
}
