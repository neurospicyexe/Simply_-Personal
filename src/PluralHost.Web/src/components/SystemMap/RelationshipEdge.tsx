import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  MarkerType,
  type EdgeProps,
} from '@xyflow/react'

export type RelationshipEdgeData = {
  label: string
  isDirected: boolean
}

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const edgeData = data as RelationshipEdgeData

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: '#555', strokeWidth: 1.5 }}
        markerEnd={
          edgeData?.isDirected
            ? `url(#${MarkerType.ArrowClosed})`
            : undefined
        }
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 9,
              color: '#888',
              pointerEvents: 'none',
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
