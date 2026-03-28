import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api/client'
import { relationshipsApi } from '../api/relationships'

const mockFetch = vi.mocked(apiFetch)

beforeEach(() => { mockFetch.mockReset() })

describe('relationshipsApi', () => {
  it('list calls GET /api/members/relationships', async () => {
    mockFetch.mockResolvedValue([])
    await relationshipsApi.list()
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships')
  })

  it('create calls POST with payload', async () => {
    mockFetch.mockResolvedValue({ id: '1' })
    await relationshipsApi.create({ fromMemberId: 'a', toMemberId: 'b', label: 'siblings', isDirected: false })
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships', {
      method: 'POST',
      body: JSON.stringify({ fromMemberId: 'a', toMemberId: 'b', label: 'siblings', isDirected: false }),
    })
  })

  it('update calls PATCH with id', async () => {
    mockFetch.mockResolvedValue({ id: '1' })
    await relationshipsApi.update('abc', { label: 'rivals' })
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships/abc', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'rivals' }),
    })
  })

  it('remove calls DELETE with id', async () => {
    mockFetch.mockResolvedValue(undefined)
    await relationshipsApi.remove('abc')
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships/abc', { method: 'DELETE' })
  })
})
