
import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  createUserConnection,
  closeUserConnection,
  getUserDatabase,
} from '../services/userConnectionService.js'

const router = Router()

router.use(requireAuth)

router.post('/connect', async (req, res) => {
  try {
    const { connectionString, databaseName } = req.body

    if (!connectionString || !databaseName) {
      return res.status(400).json({
        message: 'Connection string and database name are required',
      })
    }

    const connection = await createUserConnection(
      req.user.id,
      connectionString,
      databaseName
    )

    return res.status(201).json({
      message: 'MongoDB connection successful',
      ...connection,
    })
  } catch (error) {
    const status =
      error.message.startsWith('Invalid ') ||
      error.message.startsWith('For this version') ||
      error.message.startsWith('Connection limit')
        ? 400
        : error.message === 'Authentication required'
          ? 401
          : 502

    return res.status(status).json({
      message: error.message || 'Unable to connect to MongoDB',
    })
  }
})

router.get('/:connectionId/status', async (req, res) => {
  const db = getUserDatabase(req.user.id, req.params.connectionId)

  if (!db) {
    return res.status(404).json({
      connected: false,
      message: 'Connection not found. Connect again and retry.',
    })
  }

  try {
    await db.command({ ping: 1 })

    return res.json({
      connected: true,
      databaseName: db.databaseName,
    })
  } catch {
    return res.status(503).json({
      connected: false,
      message: 'Database connection is no longer available.',
    })
  }
})

router.get('/:connectionId/collections', async (req, res) => {
  try {
    const db = getUserDatabase(req.user.id, req.params.connectionId)

    if (!db) {
      return res.status(404).json({
        message: 'Connection not found. Connect again and retry.',
      })
    }

    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray()

    return res.json({
      databaseName: db.databaseName,
      collections: collections.map(item => item.name),
    })
  } catch {
    return res.status(500).json({
      message: 'Unable to retrieve collections',
    })
  }
})

router.delete('/:connectionId', async (req, res) => {
  try {
    const closed = await closeUserConnection(
      req.user.id,
      req.params.connectionId
    )

    if (!closed) {
      return res.status(404).json({
        message: 'Connection not found',
      })
    }

    return res.json({
      message: 'MongoDB connection closed successfully',
    })
  } catch {
    return res.status(500).json({
      message: 'Unable to close MongoDB connection',
    })
  }
})

export default router
