import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FloatingToolbar } from '../components/Map/FloatingToolbar'
import type { Member, Group } from '../types'
import { useQuery } from '@tanstack/react-query'

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) }
})

vi.mock('../components/Map/SigmaMapCanvas', () => ({
  SigmaMapCanvas: ({ connectMode }: { connectMode: boolean }) => (
    <div data-testid="sigma-canvas">{connectMode ? 'connect-mode' : 'view-mode'}</div>
  ),
}))

vi.mock('../hooks/useSigmaGraph', () => ({
  useSigmaGraph: () => ({ hasNode: () => false }),
}))

function wrap(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

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

import MapPage from '../pages/MapPage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MapPage', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as any)
  })

  it('renders sigma canvas', () => {
    render(<AppWrapper><MapPage /></AppWrapper>)
    expect(screen.getByTestId('sigma-canvas')).toBeInTheDocument()
  })
})
