import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi } from 'vitest'
import MemberDetailPage from '../pages/MemberDetailPage'

const MEMBER = {
  id: 'm1', name: 'Sage', color: '#b6ff00', pronouns: 'they/them',
  description: 'A test member', privacyTier: 'Public' as const,
  isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined,
  isPinned: false, isUntracked: false,
  preventFrontNotification: false, receiveBoardNotifications: false,
  createdAt: '', updatedAt: '',
}

vi.mock('../api/members', () => ({
  membersApi: {
    get: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', privacyTier: 'Public',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '',
    }),
    update: vi.fn().mockResolvedValue({
      id: 'm1', name: 'Sage Updated', color: '#b6ff00', pronouns: 'they/them',
      description: 'A test member', privacyTier: 'Public',
      isArchived: false, groupIds: [], parentIds: [], avatarPath: undefined,
      isPinned: false, isUntracked: false,
      preventFrontNotification: false, receiveBoardNotifications: false,
      createdAt: '', updatedAt: '',
    }),
    list: vi.fn().mockResolvedValue([]),
  },
}))
vi.mock('../api/groups', () => ({
  groupsApi: {
    list: vi.fn().mockResolvedValue([]),
    setMemberships: vi.fn().mockResolvedValue(undefined),
  },
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/members/m1']}>
        <Routes>
          <Route path="/members/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

test('renders member name and pronouns', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  expect(await screen.findByRole('heading', { name: 'Sage' })).toBeInTheDocument()
  expect(screen.getAllByText('they/them').length).toBeGreaterThan(0)
})

test('Profile tab is active by default', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  const profileTab = screen.getByRole('tab', { name: /profile/i })
  expect(profileTab).toHaveAttribute('aria-selected', 'true')
})

test('switching to Options tab shows privacy controls', async () => {
  render(<MemberDetailPage />, { wrapper: Wrapper })
  await screen.findByRole('heading', { name: 'Sage' })
  await userEvent.click(screen.getByRole('tab', { name: /options/i }))
  expect(screen.getByText(/privacy/i)).toBeInTheDocument()
})
