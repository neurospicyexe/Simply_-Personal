import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface AuthContextValue {
  isAuthenticated: boolean
  setAuthenticated: (v: boolean) => void
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  setAuthenticated: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
