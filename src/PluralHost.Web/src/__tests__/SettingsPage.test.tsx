import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import SettingsPage from '../pages/SettingsPage'

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
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: /security/i })).toBeInTheDocument()
  })

  it('Security section is collapsed by default', () => {
    render(<SettingsPage />)
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands Security section on click', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /security/i }))
    expect(
      screen.getByRole('button', { name: /security/i })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows Change Password and Gatekeeper PIN headings when expanded', () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: /security/i }))
    expect(screen.getByRole('heading', { name: /change password/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /gatekeeper pin/i })).toBeInTheDocument()
  })
})
