import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import EntrySheet from '../components/EntrySheet'
import type { JournalEntry } from '../types'

vi.mock('../api/journals', () => ({
  journalsApi: {
    create: vi.fn().mockResolvedValue({ id: 'new', title: 'T', content: 'C', isPrivate: true, createdAt: '', updatedAt: '' }),
    update: vi.fn().mockResolvedValue({ id: 'e1', title: 'T', content: 'C', isPrivate: true, createdAt: '', updatedAt: '' }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}))

const mockEntry: JournalEntry = {
  id: 'e1',
  title: 'Test Entry',
  content: '**Hello world**',
  isPrivate: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('EntrySheet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders nothing when closed', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens in view mode for existing entry', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('opens in edit mode for new entry (null)', () => {
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/content/i)).toBeInTheDocument()
  })

  it('switches to edit mode when pencil clicked', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByDisplayValue('Test Entry')).toBeInTheDocument()
  })

  it('disables save when content is empty', () => {
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    const saveBtn = screen.getByRole('button', { name: /save/i })
    expect(saveBtn).toBeDisabled()
  })

  it('calls journalsApi.create on save for new entry', async () => {
    const { journalsApi } = await import('../api/journals')
    wrap(<EntrySheet entry={null} isOpen onClose={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/content/i), { target: { value: 'My content' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(journalsApi.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'My content' })
    ))
  })

  it('calls journalsApi.update on save for existing entry', async () => {
    const { journalsApi } = await import('../api/journals')
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.change(screen.getByDisplayValue('Test Entry'), { target: { value: 'New Title' } })
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(journalsApi.update).toHaveBeenCalledWith(
      'e1', expect.objectContaining({ title: 'New Title' })
    ))
  })

  it('shows delete button in edit mode for existing entry', () => {
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('calls onClose after delete', async () => {
    const onClose = vi.fn()
    wrap(<EntrySheet entry={mockEntry} isOpen onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /edit/i }))
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
