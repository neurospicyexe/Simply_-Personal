import { vi, describe, it, expect, beforeEach } from 'vitest'

// Mock apiFetch before importing frontApi
vi.mock('../api/client', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api/client'
import { frontApi } from '../api/front'

describe('frontApi.historyInRange', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls /v1/frontHistory with from and to params', async () => {
    (apiFetch as ReturnType<typeof vi.fn>).mockResolvedValue([])
    const from = '2026-03-28T00:00:00.000Z'
    const to   = '2026-03-29T00:00:00.000Z'
    await frontApi.historyInRange(from, to)
    expect(apiFetch).toHaveBeenCalledWith(
      `/v1/frontHistory?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    )
  })
})
