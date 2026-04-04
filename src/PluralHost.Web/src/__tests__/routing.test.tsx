// src/__tests__/routing.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { AuthContext } from '../context/AuthContext'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

test('unauthenticated user at /front is redirected to /login', async () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: false, isLoading: false, setAuthenticated: () => {}, logout: () => Promise.resolve() }}>
        <MemoryRouter initialEntries={['/front']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

test('authenticated user at / is redirected to /front', async () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: true, isLoading: false, setAuthenticated: () => {}, logout: () => Promise.resolve() }}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  expect(await screen.findByRole('heading', { name: /fronting/i })).toBeInTheDocument()
})
