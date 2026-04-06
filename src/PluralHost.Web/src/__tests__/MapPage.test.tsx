import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import type { MemberNodeV2Data } from '../hooks/useMapLayout'
import { GroupNodeV2 } from '../components/Map/GroupNodeV2'
import type { GroupNodeV2Data } from '../hooks/useMapLayout'

// React Flow requires ResizeObserver
beforeAll(() => {
  ;(window as unknown as Record<string, unknown>).ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual('@xyflow/react')
  return {
    ...actual,
    useViewport: vi.fn().mockReturnValue({ zoom: 1, x: 0, y: 0 }),
    Handle: () => null,
  }
})

const baseData: MemberNodeV2Data = {
  id: 'member-1',
  name: 'Mira',
  color: '#ff4db8',
  pronouns: 'she/her',
  isFronting: false,
  isIsolated: false,
}

type MemberNodeProps = Parameters<typeof MemberNodeV2>[0]

function makeProps(overrides: Partial<MemberNodeV2Data> = {}): MemberNodeProps {
  return {
    id: 'member-member-1',
    data: { ...baseData, ...overrides },
    selected: false,
    type: 'memberV2',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as MemberNodeProps
}

describe('MemberNodeV2', () => {
  it('renders name and initial', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.getByText('Mira')).toBeInTheDocument()
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('renders pronouns when zoom >= 0.5', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })

  it('does not render pronouns when zoom < 0.5', async () => {
    const { useViewport } = await import('@xyflow/react')
    vi.mocked(useViewport).mockReturnValue({ zoom: 0.4, x: 0, y: 0 })
    render(<MemoryRouter><MemberNodeV2 {...makeProps()} /></MemoryRouter>)
    expect(screen.queryByText('she/her')).not.toBeInTheDocument()
    vi.mocked(useViewport).mockReturnValue({ zoom: 1, x: 0, y: 0 })
  })

  it('skips pronouns when not set', () => {
    render(<MemoryRouter><MemberNodeV2 {...makeProps({ pronouns: null })} /></MemoryRouter>)
    expect(screen.queryByText('she/her')).not.toBeInTheDocument()
  })
})

type GroupNodeProps = Parameters<typeof GroupNodeV2>[0]

function makeGroupProps(overrides: Partial<GroupNodeV2Data> = {}): GroupNodeProps {
  return {
    id: 'group-g1',
    data: { id: 'g1', name: 'Protectors', color: '#00d4ff', memberCount: 4, ...overrides },
    selected: false,
    type: 'groupV2',
    zIndex: 0,
    isConnectable: true,
    dragging: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as GroupNodeProps
}

describe('GroupNodeV2', () => {
  it('renders group name', () => {
    render(<MemoryRouter><GroupNodeV2 {...makeGroupProps()} /></MemoryRouter>)
    expect(screen.getByText('Protectors')).toBeInTheDocument()
  })

  it('renders member count badge', () => {
    render(<MemoryRouter><GroupNodeV2 {...makeGroupProps()} /></MemoryRouter>)
    expect(screen.getByText('4')).toBeInTheDocument()
  })
})
