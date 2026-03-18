import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { authApi } from '../api/auth'

interface AuthContextValue {
  isAuthenticated: boolean
  setAuthenticated: (v: boolean) => void
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  setAuthenticated: () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)

  const logout = async () => {
    await authApi.logout()
    setAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
