import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LogsPage from '../pages/LogsPage'
import type { JournalEntry } from '../types'

vi.mock('../api/journals', () => ({
  journalsApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../api/front', () => ({
  frontApi: {
    history: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('../api/members', () => ({
  membersApi: { list: vi.fn().mockResolvedValue([]) },
}))

const mockEntries: JournalEntry[] = [
  { id: 'j1', title: 'Day one', content: 'First entry', isPrivate: true, createdAt: '2026-01-01T10:00:00Z', updatedAt: '2026-01-01T10:00:00Z' },
  { id: 'j2', title: 'Day two', content: 'Second entry', isPrivate: false, createdAt: '2026-01-02T10:00:00Z', updatedAt: '2026-01-02T10:00:00Z' },
]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('LogsPage', () => {
  it('renders Journal and Front History tabs', () => {
    wrap(<LogsPage />)
    expect(screen.getByText('Journal')).toBeInTheDocument()
    expect(screen.getByText('Front History')).toBeInTheDocument()
  })

  it('shows journal entries when loaded', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    expect(await screen.findByText('Day one')).toBeInTheDocument()
    expect(screen.getByText('Day two')).toBeInTheDocument()
  })

  it('shows private badge for private entries', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    expect(screen.getByText('🔒 Private')).toBeInTheDocument()
  })

  it('filters entries by search term', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'two' } })
    expect(screen.queryByText('Day one')).not.toBeInTheDocument()
    expect(screen.getByText('Day two')).toBeInTheDocument()
  })

  it('opens sheet when plus button clicked', async () => {
    wrap(<LogsPage />)
    fireEvent.click(screen.getByRole('button', { name: /new entry/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('opens sheet when entry card clicked', async () => {
    const { journalsApi } = await import('../api/journals')
    vi.mocked(journalsApi.list).mockResolvedValue(mockEntries)
    wrap(<LogsPage />)
    await screen.findByText('Day one')
    fireEvent.click(screen.getByText('Day one'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows empty state when no entries', async () => {
    wrap(<LogsPage />)
    expect(await screen.findByText(/no journal entries yet/i)).toBeInTheDocument()
  })
})
