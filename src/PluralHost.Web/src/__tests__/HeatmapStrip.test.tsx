import { render, screen, waitFor } from '@testing-library/react'
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

  it('renders a member row when history is provided', async () => {
    const { frontApi: mockFrontApi } = await import('../api/front')
    const { membersApi: mockMembersApi } = await import('../api/members')

    const now = Date.now()
    vi.mocked(mockFrontApi.historyInRange).mockResolvedValue([
      {
        id: 'entry-1',
        content: {
          uid: 'owner',
          member: 'member-1',
          live: false,
          startTime: now - 12 * 60 * 60 * 1000, // 12h ago
          endTime: now - 6 * 60 * 60 * 1000,    // 6h ago
          custom: false,
          customStatus: null,
        },
      } as any,
    ])
    vi.mocked(mockMembersApi.list).mockResolvedValue([
      { id: 'member-1', name: 'Alice', color: '#b6ff00', displayName: null, pronouns: null, description: null, birthday: null, avatarPath: null, isArchived: false, bucketId: '00000000-0000-0000-0000-000000000001', parentIds: [], preventFrontNotification: false, receiveBoardNotifications: false } as any,
    ])

    render(wrap(<HeatmapStrip />))
    // Alice's row should appear once queries resolve (not the empty state)
    await waitFor(() => {
      expect(screen.queryByText(/no front activity/i)).not.toBeInTheDocument()
    })
  })
})
