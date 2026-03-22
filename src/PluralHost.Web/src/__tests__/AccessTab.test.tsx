import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AccessTab from '../components/tabs/AccessTab'
import type { Member } from '../types'

vi.mock('../api/members', () => ({
  membersApi: { update: vi.fn(), delete: vi.fn() },
}))
vi.mock('../api/secure', () => ({
  secureApi: {
    status: vi.fn().mockResolvedValue({ pinIsSet: true, deletionCooldownEnd: null }),
  },
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))

const mockMember: Member = {
  id: 'm1', name: 'Aria', privacyTier: 'Public',
  isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  groupIds: [], parentIds: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AccessTab', () => {
  it('renders privacy tier selector', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getByText(/privacy/i)).toBeInTheDocument()
  })

  it('renders toggle switches', () => {
    wrap(<AccessTab member={mockMember} />)
    expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(0)
  })

  it('renders delete button when no cooldown active', async () => {
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /delete aria/i })).toBeInTheDocument()
    )
  })

  it('opens delete sheet when delete button clicked', async () => {
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() => fireEvent.click(screen.getByRole('button', { name: /delete aria/i })))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows cooldown message when cooldown is active', async () => {
    const { secureApi } = await import('../api/secure')
    vi.mocked(secureApi.status).mockResolvedValueOnce({
      pinIsSet: true,
      deletionCooldownEnd: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    })
    wrap(<AccessTab member={mockMember} />)
    await waitFor(() =>
      expect(screen.getByText(/deletion available/i)).toBeInTheDocument()
    )
  })
})
