import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/relationships', () => ({
  relationshipsApi: {
    create: vi.fn().mockResolvedValue({ id: 'new-id' }),
  },
}))

import { relationshipsApi } from '../api/relationships'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'

const mockCreate = vi.mocked(relationshipsApi.create)

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('NewRelationshipSheet', () => {
  const fromMember = { id: 'from-id', name: 'Jude' }
  const toMember = { id: 'to-id', name: 'Mira' }
  const onClose = vi.fn()

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: 'new-id', fromMemberId: 'from-id', toMemberId: 'to-id', label: 'siblings', isDirected: false, createdAt: '', updatedAt: '' })
    onClose.mockReset()
  })

  it('renders from and to member names in header', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    expect(screen.getByText(/Jude/)).toBeInTheDocument()
    expect(screen.getByText(/Mira/)).toBeInTheDocument()
  })

  it('save button disabled when label is empty', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button enabled when label is filled', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/siblings/i), { target: { value: 'rivals' } })
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('directed toggle changes isDirected in payload', async () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/siblings/i), { target: { value: 'parent of' } })
    fireEvent.click(screen.getByRole('button', { name: /→ directed/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ isDirected: true, label: 'parent of' })
      )
    })
  })

  it('cancel button calls onClose without mutation', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
