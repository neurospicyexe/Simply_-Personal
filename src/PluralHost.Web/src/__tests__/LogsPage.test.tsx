import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect } from 'vitest'

vi.mock('../api/journals', () => ({
  journalsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/front', () => ({
  frontApi: { history: vi.fn().mockResolvedValue([]), historyInRange: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

import LogsPage from '../pages/LogsPage'

const wrap = (initialPath: string) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/logs" element={<LogsPage />} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

describe('LogsPage', () => {
  it('shows Journal tab by default', () => {
    render(wrap('/logs'))
    expect(screen.getByRole('tab', { name: /journal/i })).toBeInTheDocument()
  })

  it('shows Heatmap tab in tab bar', () => {
    render(wrap('/logs'))
    expect(screen.getByRole('tab', { name: /heatmap/i })).toBeInTheDocument()
  })

  it('deep-links to heatmap tab via ?tab=heatmap', async () => {
    render(wrap('/logs?tab=heatmap'))
    // FrontHeatmap renders the toggle buttons when active
    expect(await screen.findByRole('button', { name: '24h' })).toBeInTheDocument()
  })
})
