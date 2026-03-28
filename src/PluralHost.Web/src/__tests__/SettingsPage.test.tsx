import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from '../pages/SettingsPage'

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn(), isAuthenticated: true }),
}))
vi.mock('../api/secure', () => ({
  secureApi: {
    status: vi.fn().mockResolvedValue({ pinIsSet: false, deletionCooldownEnd: null }),
    setPin: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('SettingsPage', () => {
  it('renders Security section toggle button', () => {
    renderWithClient(<SettingsPage />)
    expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument()
  })

  it('Security section is open by default (first-run UX)', () => {
    renderWithClient(<SettingsPage />)
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('collapses Security section on click', () => {
    renderWithClient(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /security/i }))
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows Change Password and Gatekeeper PIN headings by default', () => {
    renderWithClient(<SettingsPage />)
    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /gatekeeper pin/i })).toBeInTheDocument()
  })
})
