import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import SettingsPage from '../pages/SettingsPage'

const mockLogout = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}))
vi.mock('../api/auth', () => ({
  authApi: { logout: vi.fn().mockResolvedValue(undefined) },
}))

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

test('logout button calls auth logout', async () => {
  render(<SettingsPage />, { wrapper: Wrapper })
  await userEvent.click(screen.getByRole('button', { name: /log out/i }))
  expect(mockLogout).toHaveBeenCalled()
})
