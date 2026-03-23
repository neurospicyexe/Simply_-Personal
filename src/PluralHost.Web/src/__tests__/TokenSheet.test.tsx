import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TokenSheet from '../components/TokenSheet'
import type { PrivacyBucket } from '../types'

vi.mock('../api/tokens', () => ({
  tokensApi: {
    create: vi.fn().mockResolvedValue({
      tokenValue: 'abc', label: 'Test', minBucketSortOrder: 1,
      allowsBoardPosting: false, expiresAt: null, revokedAt: null, createdAt: '',
    }),
  },
}))

vi.mock('../api/buckets', () => ({
  bucketsApi: { list: vi.fn().mockResolvedValue([]) },
}))

const mockBuckets: PrivacyBucket[] = [
  { id: '1', name: 'Public', description: null, emoji: null, color: null, sortOrder: 0, isDefault: true, memberCount: 0 },
  { id: '2', name: 'Friend', description: null, emoji: null, color: null, sortOrder: 1, isDefault: true, memberCount: 0 },
]

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('TokenSheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when closed', () => {
    wrap(<TokenSheet isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders form when open', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/friend link/i)).toBeInTheDocument()
  })

  it('disables Create when label is empty', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled()
  })

  it('enables Create when label is filled', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    expect(screen.getByRole('button', { name: /create/i })).not.toBeDisabled()
  })

  it('shows bucket options when buckets loaded', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(await screen.findByText('Public')).toBeInTheDocument()
    expect(screen.getByText('Friend')).toBeInTheDocument()
  })

  it('shows Front Only option', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    expect(screen.getByText(/front only/i)).toBeInTheDocument()
  })

  it('hides board posting toggle when Front Only selected', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    // Front Only is default — board posting should not be visible
    expect(screen.queryByLabelText(/board posting/i)).not.toBeInTheDocument()
  })

  it('shows board posting toggle when a bucket is selected', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    expect(screen.getByLabelText(/board posting/i)).toBeInTheDocument()
  })

  it('calls tokensApi.create with correct payload on submit', async () => {
    const { tokensApi } = await import('../api/tokens')
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    const onClose = vi.fn()
    wrap(<TokenSheet isOpen onClose={onClose} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(tokensApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'My Link', minBucketSortOrder: 0 })
    ))
  })

  it('calls onClose after successful create', async () => {
    const { bucketsApi } = await import('../api/buckets')
    vi.mocked(bucketsApi.list).mockResolvedValue(mockBuckets)
    const onClose = vi.fn()
    wrap(<TokenSheet isOpen onClose={onClose} />)
    await screen.findByText('Public')
    fireEvent.click(screen.getByText('Public'))
    fireEvent.change(screen.getByPlaceholderText(/friend link/i), { target: { value: 'My Link' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('selecting a preset chip clears the custom date input', () => {
    wrap(<TokenSheet isOpen onClose={vi.fn()} />)
    // Open custom date by clicking calendar chip
    fireEvent.click(screen.getByRole('button', { name: /custom date/i }))
    expect(screen.getByRole('textbox', { hidden: true })).toBeInTheDocument() // label input still present
    expect(screen.getByDisplayValue(new Date().toISOString().slice(0, 10))).toBeInTheDocument() // date input visible
    // Select a preset chip — custom date input should disappear
    fireEvent.click(screen.getByRole('button', { name: /30 days/i }))
    expect(screen.queryByDisplayValue(new Date().toISOString().slice(0, 10))).not.toBeInTheDocument()
  })
})
