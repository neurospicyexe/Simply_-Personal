import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemberNodeV2 } from '../components/Map/MemberNodeV2'
import type { MemberNodeV2Data } from '../hooks/useMapLayout'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrap = (ui: React.ReactNode) => (
  <QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>
)

// React Flow requires ResizeObserver
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
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
