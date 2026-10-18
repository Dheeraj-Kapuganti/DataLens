
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  async function refreshUser() {
    try {
      const response = await api.get('/auth/me')
      setUser(response.data.user)
      return response.data.user
    } catch {
      setUser(null)
      return null
    }
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }

  useEffect(() => {
    let active = true

    async function checkSession() {
      try {
        const response = await api.get('/auth/me')

        if (active) {
          setUser(response.data.user)
        }
      } catch {
        if (active) {
          setUser(null)
        }
      } finally {
        if (active) {
          setCheckingAuth(false)
        }
      }
    }

    checkSession()

    return () => {
      active = false
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        refreshUser,
        logout,
        checkingAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
