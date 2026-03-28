import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../api/front', () => ({
  frontApi: {
    historyInRange: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../api/members', () => ({
  membersApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}))

import HeatmapStrip from '../components/HeatmapStrip'

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

describe('HeatmapStrip', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders empty state when no history', async () => {
    render(wrap(<HeatmapStrip />))
    expect(await screen.findByText(/no front activity/i)).toBeInTheDocument()
  })

  it('renders full view link', () => {
    render(wrap(<HeatmapStrip />))
    expect(screen.getByRole('button', { name: /full view/i })).toBeInTheDocument()
  })

  it('renders Last 24h label', () => {
    render(wrap(<HeatmapStrip />))
    expect(screen.getByText('Last 24h')).toBeInTheDocument()
  })
})
