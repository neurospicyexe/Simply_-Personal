import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import MembersPage from '../pages/MembersPage'

// Mock APIs
vi.mock('../api/members', () => ({
  membersApi: {
    list: vi.fn().mockResolvedValue([
      { id: '1', name: 'Aiden', color: '#b6ff00', pronouns: 'he/him', isArchived: false, groupIds: [], privacyTier: 'Public', parentIds: [], allowsBoardPosting: false, isPinned: false, isUntracked: false, preventFrontNotification: false, receiveBoardNotifications: false, extraImages: [], createdAt: '', updatedAt: '' },
      { id: '2', name: 'Blake', color: '#ff4db8', pronouns: null, isArchived: false, groupIds: [], privacyTier: 'Public', parentIds: [], allowsBoardPosting: false, isPinned: false, isUntracked: false, preventFrontNotification: false, receiveBoardNotifications: false, extraImages: [], createdAt: '', updatedAt: '' },
      { id: '3', name: 'Casey', color: '#00d4ff', pronouns: 'they/them', isArchived: false, groupIds: [], privacyTier: 'Public', parentIds: [], allowsBoardPosting: false, isPinned: false, isUntracked: false, preventFrontNotification: false, receiveBoardNotifications: false, extraImages: [], createdAt: '', updatedAt: '' },
    ]),
  },
}))
vi.mock('../api/groups', () => ({
  groupsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('../api/front', () => ({
  frontApi: { getCurrent: vi.fn().mockResolvedValue([]) },
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

test('renders member names after load', async () => {
  render(<MembersPage />, { wrapper: Wrapper })
  expect(await screen.findByText('Aiden')).toBeInTheDocument()
  expect(screen.getByText('Blake')).toBeInTheDocument()
})

test('search filters member list', async () => {
  render(<MembersPage />, { wrapper: Wrapper })
  await screen.findByText('Aiden')
  const searchInput = screen.getByPlaceholderText(/search/i)
  await userEvent.type(searchInput, 'Bla')
  expect(screen.queryByText('Aiden')).not.toBeInTheDocument()
  expect(screen.getByText('Blake')).toBeInTheDocument()
})

test('alphabetical letter headers displayed', async () => {
  render(<MembersPage />, { wrapper: Wrapper })
  await screen.findByText('Aiden')
  // getAllByText because Avatar also renders the initial letter
  expect(screen.getAllByText('A').length).toBeGreaterThan(0)
  expect(screen.getAllByText('B').length).toBeGreaterThan(0)
  expect(screen.getAllByText('C').length).toBeGreaterThan(0)
})
