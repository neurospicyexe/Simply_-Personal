import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Member, Group, MemberRelationship } from '../types'
import { MemberNode } from '../components/SystemMap/MemberNode'
import { GroupNode } from '../components/SystemMap/GroupNode'

class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
global.ResizeObserver = ResizeObserverMock as any

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: vi.fn(),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn() },
}))
vi.mock('../api/groups', () => ({
  groupsApi: { list: vi.fn() },
}))
vi.mock('../api/relationships', () => ({
  relationshipsApi: { list: vi.fn() },
}))
vi.mock('../api/front', () => ({
  frontApi: { getCurrent: vi.fn() },
}))

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

// --- SystemMap integration tests ---

import { SystemMap } from '../components/SystemMap/SystemMap'
import { useQuery } from '@tanstack/react-query'

const testMembers: Member[] = [
  {
    id: 'mem-1', name: 'Jude', color: '#b6ff00', bucketId: 'pub', isArchived: false,
    isUntracked: false, isPinned: false, preventFrontNotification: false,
    receiveBoardNotifications: false, groupIds: ['grp-1'], parentIds: ['grp-1'],
    createdAt: '', updatedAt: '',
  },
  {
    id: 'mem-2', name: 'Mira', color: '#00d4ff', bucketId: 'pub', isArchived: false,
    isUntracked: false, isPinned: false, preventFrontNotification: false,
    receiveBoardNotifications: false, groupIds: [], parentIds: [],
    createdAt: '', updatedAt: '',
  },
]
const testGroups: Group[] = [
  { id: 'grp-1', name: 'Inner Circle', color: '#b6ff00', memberCount: 1 },
]
const testRelationships: MemberRelationship[] = [
  { id: 'rel-1', fromMemberId: 'mem-1', toMemberId: 'mem-2', label: 'siblings', isDirected: false, createdAt: '', updatedAt: '' },
]

function MapWrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReactFlowProvider>
          {children}
        </ReactFlowProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SystemMap', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockImplementation(({ queryKey }: any) => {
      if (queryKey[0] === 'members') return { data: testMembers, isLoading: false } as any
      if (queryKey[0] === 'groups') return { data: testGroups, isLoading: false } as any
      if (queryKey[0] === 'relationships') return { data: testRelationships, isLoading: false } as any
      if (queryKey[0] === 'front-current') return { data: [], isLoading: false } as any
      return { data: [], isLoading: false } as any
    })
  })

  it('renders a node for each member', () => {
    render(<MapWrapper><SystemMap /></MapWrapper>)
    expect(screen.getByText('Jude')).toBeInTheDocument()
    expect(screen.getByText('Mira')).toBeInTheDocument()
  })

  it('Groups mode shows group node', () => {
    render(<MapWrapper><SystemMap initialMode="groups" /></MapWrapper>)
    expect(screen.getByText('Inner Circle')).toBeInTheDocument()
  })

  it('Relationships mode does not show group node', () => {
    render(<MapWrapper><SystemMap initialMode="relationships" /></MapWrapper>)
    expect(screen.queryByText('Inner Circle')).not.toBeInTheDocument()
  })
})
