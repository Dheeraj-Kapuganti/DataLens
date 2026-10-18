
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'

const connections = new Map()
const MAX_CONNECTIONS_PER_USER = 5

function validateConnectionInput(connectionString, databaseName) {
  if (
    typeof connectionString !== 'string' ||
    connectionString.length > 2048
  ) {
    throw new Error('Invalid MongoDB connection string')
  }

  if (
    typeof databaseName !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,63}$/.test(databaseName)
  ) {
    throw new Error('Invalid database name')
  }

  let parsed

  try {
    parsed = new URL(connectionString)
  } catch {
    throw new Error('Invalid MongoDB connection string')
  }

  if (
    parsed.protocol !== 'mongodb+srv:' ||
    !parsed.hostname.endsWith('.mongodb.net') ||
    parsed.hostname === 'mongodb.net' ||
    parsed.hostname.includes('..') ||
    parsed.port ||
    parsed.hash
  ) {
    throw new Error(
      'For this version, use a MongoDB Atlas SRV connection string'
    )
  }
}

export async function createUserConnection(
  userId,
  connectionString,
  databaseName
) {
  if (typeof userId !== 'string' || !userId) {
    throw new Error('Authentication required')
  }

  validateConnectionInput(connectionString, databaseName)

  const userConnectionCount = [...connections.values()].filter(
    connection => connection.userId === userId
  ).length

  if (userConnectionCount >= MAX_CONNECTIONS_PER_USER) {
    throw new Error(
      'Connection limit reached. Disconnect an existing database first.'
    )
  }

  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 5,
    minPoolSize: 0,
    appName: 'DataLens',
  })

  try {
    await client.connect()

    const db = client.db(databaseName)
    await db.command({ ping: 1 })

    const connectionId = randomUUID()
    const createdAt = new Date().toISOString()

    connections.set(connectionId, {
      userId,
      client,
      db,
      databaseName,
      createdAt,
    })

    return {
      connectionId,
      databaseName,
      connectedAt: createdAt,
    }
  } catch {
    await client.close().catch(() => {})
    throw new Error(
      'Could not connect to MongoDB Atlas. Check the URI, database access permissions, and network access settings.'
    )
  }
}

export function getUserDatabase(userId, connectionId) {
  if (
    typeof userId !== 'string' ||
    typeof connectionId !== 'string'
  ) {
    return null
  }

  const connection = connections.get(connectionId)

  if (!connection || connection.userId !== userId) {
    return null
  }

  return connection.db
}

export async function closeUserConnection(userId, connectionId) {
  const connection = connections.get(connectionId)

  if (!connection || connection.userId !== userId) {
    return false
  }

  connections.delete(connectionId)
  await connection.client.close()

  return true
}

export async function closeAllUserConnections() {
  const activeConnections = [...connections.values()]
  connections.clear()

  await Promise.all(
    activeConnections.map(({ client }) =>
      client.close().catch(() => {})
    )
  )
}
