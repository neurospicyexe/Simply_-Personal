import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { SystemMap } from '../components/SystemMap/SystemMap'

// Mock Sigma so no WebGL needed
vi.mock('../components/Map/SigmaMapCanvas', () => ({
  SigmaMapCanvas: ({ connectMode }: { connectMode: boolean }) => (
    <div data-testid="sigma-canvas">{connectMode ? 'connect-mode' : 'view-mode'}</div>
  ),
}))

vi.mock('../hooks/useSigmaGraph', () => ({
  useSigmaGraph: () => ({ hasNode: () => false }),
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return { ...actual, useQuery: vi.fn(), useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }) }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

class ResizeObserverMock {
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn()
}
globalThis.ResizeObserver = ResizeObserverMock as any

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SystemMap', () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as any)
  })

  it('renders sigma canvas', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByTestId('sigma-canvas')).toBeInTheDocument()
  })

  it('renders mode chips', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText('Groups')).toBeInTheDocument()
    expect(screen.getByText('Relationships')).toBeInTheDocument()
    expect(screen.getByText('Both')).toBeInTheDocument()
  })

  it('shows connect button', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText('Connect')).toBeInTheDocument()
  })

  it('toggles connect mode', () => {
    render(<Wrapper><SystemMap /></Wrapper>)
    fireEvent.click(screen.getByText('Connect'))
    expect(screen.getByTestId('sigma-canvas')).toHaveTextContent('connect-mode')
  })

  it('shows loading overlay while queries pending', () => {
    vi.mocked(useQuery).mockReturnValue({ data: undefined, isLoading: true } as any)
    render(<Wrapper><SystemMap /></Wrapper>)
    expect(screen.getByText(/loading map/i)).toBeInTheDocument()
  })
})
