// src/__tests__/routing.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { AuthContext } from '../context/AuthContext'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

test('unauthenticated user at /front is redirected to /login', () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: false, setAuthenticated: () => {} }}>
        <MemoryRouter initialEntries={['/front']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

test('authenticated user at / is redirected to /front', () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: true, setAuthenticated: () => {} }}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  expect(screen.getByText(/fronting now/i)).toBeInTheDocument()
})
