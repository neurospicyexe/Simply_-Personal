import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { MemberNode } from '../components/SystemMap/MemberNode'
import { GroupNode } from '../components/SystemMap/GroupNode'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const memberData = { id: 'mem-1', name: 'Jude', color: '#b6ff00', isFronting: false, isIsolated: false }
const groupData = { name: 'Inner Circle', color: '#b6ff00', memberNodeIds: ['mem-1'] }

function NodeWrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter><ReactFlowProvider>{children}</ReactFlowProvider></MemoryRouter>
}

describe('MemberNode', () => {
  it('renders member name', () => {
    render(
      <NodeWrapper>
        <MemberNode
          data={memberData}
          id="mem-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="member"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    expect(screen.getByText('Jude')).toBeInTheDocument()
  })

  it('navigates to member detail on click', () => {
    render(
      <NodeWrapper>
        <MemberNode
          data={memberData}
          id="mem-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="member"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    fireEvent.click(screen.getByText('Jude').closest('div')!)
    expect(mockNavigate).toHaveBeenCalledWith('/members/mem-1')
  })
})

describe('GroupNode', () => {
  it('renders group name', () => {
    render(
      <NodeWrapper>
        <GroupNode
          data={groupData}
          id="grp-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="group"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    expect(screen.getByText('Inner Circle')).toBeInTheDocument()
  })
})
