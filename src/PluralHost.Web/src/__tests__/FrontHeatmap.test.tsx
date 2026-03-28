import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('../api/front', () => ({
  frontApi: { historyInRange: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

import FrontHeatmap from '../components/FrontHeatmap'

const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </QueryClientProvider>
)

describe('FrontHeatmap', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders empty state when no history', async () => {
    render(wrap(<FrontHeatmap />))
    expect(await screen.findByText(/no front activity/i)).toBeInTheDocument()
  })

  it('renders time range toggle buttons', () => {
    render(wrap(<FrontHeatmap />))
    expect(screen.getByRole('button', { name: '24h' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '7d' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30d' })).toBeInTheDocument()
  })

  it('24h is active by default', () => {
    render(wrap(<FrontHeatmap />))
    const btn = screen.getByRole('button', { name: '24h' })
    expect(btn.className).toMatch(/active/i)
  })

  it('clicking 7d changes active range', async () => {
    render(wrap(<FrontHeatmap />))
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(screen.getByRole('button', { name: '7d' }).className).toMatch(/active/i)
  })
})
