
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import api from '../services/api'
import { useAuth } from './AuthContext'

const ConnectionContext = createContext(null)
const STORAGE_KEY = 'datalens-connection-state'

function getSavedState(userId) {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || 'null'
    )

    return saved?.userId === userId ? saved : null
  } catch {
    return null
  }
}

export function ConnectionProvider({ children }) {
  const { user } = useAuth()

  const [connection, setConnection] = useState(null)
  const [collection, setCollection] = useState('')
  const [checkingConnection, setCheckingConnection] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function restoreConnection() {
      setConnection(null)
      setCollection('')
      setCheckingConnection(true)

      if (!user?.id) {
        localStorage.removeItem(STORAGE_KEY)
        setCheckingConnection(false)
        return
      }

      const saved = getSavedState(user.id)

      if (!saved?.connection?.connectionId) {
        setCheckingConnection(false)
        return
      }

      try {
        const response = await api.get(
          `/connections/${saved.connection.connectionId}/status`
        )

        if (cancelled) return

        if (response.data.connected) {
          setConnection({
            ...saved.connection,
            databaseName: response.data.databaseName,
          })
          setCollection(saved.collection || '')
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY)
        }
      } finally {
        if (!cancelled) {
          setCheckingConnection(false)
        }
      }
    }

    restoreConnection()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (checkingConnection || !user?.id) return

    if (connection) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          userId: user.id,
          connection,
          collection,
        })
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [connection, collection, checkingConnection, user?.id])

  function clearConnection() {
    setConnection(null)
    setCollection('')
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <ConnectionContext.Provider
      value={{
        connection,
        setConnection,
        collection,
        setCollection,
        clearConnection,
        checkingConnection,
      }}
    >
      {children}
    </ConnectionContext.Provider>
  )
}

export function useConnection() {
  const context = useContext(ConnectionContext)

  if (!context) {
    throw new Error(
      'useConnection must be used within ConnectionProvider'
    )
  }

  return context
}
