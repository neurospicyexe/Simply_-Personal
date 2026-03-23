import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SystemPage from '../pages/SystemPage'

vi.mock('../api/groups', () => ({
  groupsApi: { list: vi.fn().mockResolvedValue([]) },
}))

vi.mock('../api/buckets', () => ({
  bucketsApi: { list: vi.fn().mockResolvedValue([]) },
  PUBLIC_BUCKET_ID: '00000000-0000-0000-0000-000000000001',
}))

vi.mock('../api/tokens', () => ({
  tokensApi: {
    list: vi.fn().mockResolvedValue([]),
    revoke: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue({
      tokenValue: 'tok1', label: 'My Link', minBucketSortOrder: 0,
      allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '',
    }),
  },
}))

vi.mock('../components/GroupSheet', () => ({
  default: () => null,
}))

vi.mock('../components/BucketSheet', () => ({
  default: () => null,
}))

vi.mock('../components/TokenSheet', () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="New token" /> : null,
}))

Object.assign(navigator, { clipboard: { writeText: vi.fn() } })

function wrapWithRoute(path: string, ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>
  )
}

describe('SystemPage', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([])
  })

  it('defaults to Groups tab when no search param', () => {
    wrapWithRoute('/system', <SystemPage />)
    expect(screen.getByText('No groups yet. Tap + to create one.')).toBeInTheDocument()
  })

  it('shows Tokens tab when ?tab=Tokens', async () => {
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    expect(await screen.findByText('No share links yet.')).toBeInTheDocument()
  })

  it('Tokens tab renders token list', async () => {
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([
      { tokenValue: 'tok1', label: 'My Link', minBucketSortOrder: 0,
        allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '' },
    ])
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    expect(await screen.findByText('My Link')).toBeInTheDocument()
  })

  it('copy button shows Copied!', async () => {
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([
      { tokenValue: 'tok1', label: 'My Link', minBucketSortOrder: 0,
        allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '' },
    ])
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    await screen.findByText('My Link')
    fireEvent.click(screen.getByRole('button', { name: /copy url for my link/i }))
    expect(await screen.findByText('Copied!')).toBeInTheDocument()
  })

  it('revoke button opens PIN sheet', async () => {
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([
      { tokenValue: 'tok1', label: 'My Link', minBucketSortOrder: 0,
        allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '' },
    ])
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    await screen.findByText('My Link')
    fireEvent.click(screen.getByRole('button', { name: /revoke my link/i }))
    expect(await screen.findByLabelText(/gatekeeper pin/i)).toBeInTheDocument()
  })

  it('+ New button opens TokenSheet', async () => {
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([])
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    await screen.findByText('No share links yet.')
    fireEvent.click(screen.getByRole('button', { name: /add token/i }))
    expect(await screen.findByRole('dialog', { name: /new token/i })).toBeInTheDocument()
  })

  it('revoked tokens appear dimmed', async () => {
    const { tokensApi } = await import('../api/tokens')
    vi.mocked(tokensApi.list).mockResolvedValue([
      { tokenValue: 'tok2', label: 'Old Link', minBucketSortOrder: 0,
        allowsBoardPosting: false, expiresAt: null, revokedAt: '2026-01-01T00:00:00Z', createdAt: '' },
    ])
    wrapWithRoute('/system?tab=Tokens', <SystemPage />)
    expect(await screen.findByText('Old Link')).toBeInTheDocument()
    expect(screen.getByText('revoked')).toBeInTheDocument()
  })

  it('falls back to Groups tab for unknown tab param', () => {
    wrapWithRoute('/system?tab=bogus', <SystemPage />)
    expect(screen.getByText('No groups yet. Tap + to create one.')).toBeInTheDocument()
  })
})
