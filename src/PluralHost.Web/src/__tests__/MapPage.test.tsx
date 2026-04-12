import React from 'react'
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import type { MemberNodeV2Data } from '../hooks/useMapLayout'
import { GroupNodeV2 } from '../components/Map/GroupNodeV2'
import type { GroupNodeV2Data } from '../hooks/useMapLayout'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import type { Member, Group } from '../types'

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

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

describe('FloatingToolbar', () => {
  const members = [{ id: 'm1', name: 'Mira', displayName: 'Mira' } as Member]
  const groups = [{ id: 'g1', name: 'Protectors' } as Group]

  it('renders mode chips', () => {
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        connectMode={false} onConnectModeChange={vi.fn()}
      />
    ))
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Relationships')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
  })

  it('calls onModeChange when chip clicked', () => {
    const onModeChange = vi.fn()
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={onModeChange}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        connectMode={false} onConnectModeChange={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByText('Relationships'))
    expect(onModeChange).toHaveBeenCalledWith('relationships')
  })

  it('shows breadcrumb when filter is active', () => {
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'member', id: 'm1', name: 'Mira' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        connectMode={false} onConnectModeChange={vi.fn()}
      />
    ))
    expect(screen.getByText(/Mira/)).toBeInTheDocument()
  })

  it('calls onFilterChange with all when breadcrumb X clicked', () => {
    const onFilterChange = vi.fn()
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'member', id: 'm1', name: 'Mira' }} onFilterChange={onFilterChange}
        members={members} groups={groups}
        connectMode={false} onConnectModeChange={vi.fn()}
      />
    ))
    fireEvent.click(screen.getByLabelText('Clear filter'))
    expect(onFilterChange).toHaveBeenCalledWith({ type: 'all' })
  })

  it('calls onConnectModeChange when Connect button clicked', () => {
    const onConnectModeChange = vi.fn()
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        connectMode={false} onConnectModeChange={onConnectModeChange}
      />
    ))
    fireEvent.click(screen.getByText('Connect'))
    expect(onConnectModeChange).toHaveBeenCalledWith(true)
  })

  it('shows active state when connectMode is true', () => {
    render(wrap(
      <FloatingToolbar
        mode="groups" onModeChange={vi.fn()}
        viewFilter={{ type: 'all' }} onFilterChange={vi.fn()}
        members={members} groups={groups}
        connectMode={true} onConnectModeChange={vi.fn()}
      />
    ))
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })
})
