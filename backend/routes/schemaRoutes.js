
import { Router } from 'express'
import { getUserDatabase } from '../services/userConnectionService.js'

const router = Router()

function getFieldType(value) {
  if (value === null) return 'null'
  if (value instanceof Date) return 'date'
  if (Array.isArray(value)) return 'array'
  if (value?._bsontype === 'ObjectId') return 'objectId'
  if (value?._bsontype === 'Decimal128') return 'decimal'
  if (value?._bsontype === 'Long' || value?._bsontype === 'Int32') {
    return 'number'
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'number'
  }
  if (typeof value === 'string') return 'string'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'object') return 'object'
  return 'unknown'
}

function inferSchema(documents) {
  const fields = new Map()

  function inspect(value, path) {
    const type = getFieldType(value)

    if (!fields.has(path)) {
      fields.set(path, {
        name: path,
        types: new Set(),
        occurrences: 0,
        arrayItemTypes: new Set(),
      })
    }

    const field = fields.get(path)
    field.types.add(type)
    field.occurrences += 1

    if (type === 'array') {
      for (const item of value) {
        field.arrayItemTypes.add(getFieldType(item))

        if (item && typeof item === 'object' && !Array.isArray(item)) {
          inspectObject(item, path)
        }
      }
    } else if (type === 'object') {
      inspectObject(value, path)
    }
  }

  function inspectObject(object, parentPath = '') {
    for (const [key, value] of Object.entries(object)) {
      const path = parentPath ? `${parentPath}.${key}` : key
      inspect(value, path)
    }
  }

  for (const document of documents) {
    inspectObject(document)
  }

  return [...fields.values()]
    .map((field) => ({
      name: field.name,
      type:
        field.types.size === 1
          ? [...field.types][0]
          : 'mixed',
      types: [...field.types].sort(),
      occurrences: field.occurrences,
      arrayItemTypes: [...field.arrayItemTypes].sort(),
      missingInSample: documents.length - field.occurrences,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

router.post('/schema', async (req, res) => {
  try {
    const { connectionId, collection: collectionName } = req.body
    const sampleSize = Number(req.body.sampleSize ?? 100)

    if (
      !Number.isInteger(sampleSize) ||
      sampleSize < 1 ||
      sampleSize > 200
    ) {
      return res.status(400).json({
        message: 'Sample size must be between 1 and 200',
      })
    }

    let db
    let targetCollectionName

    if (connectionId !== undefined) {
      if (
        typeof connectionId !== 'string' ||
        typeof collectionName !== 'string' ||
        !collectionName.trim()
      ) {
        return res.status(400).json({
          message: 'A valid connection ID and collection are required',
        })
      }

      db = getUserDatabase(connectionId)

      if (!db) {
        return res.status(404).json({
          message: 'Connection not found. Connect the database again.',
        })
      }

      const existingCollections = await db
        .listCollections({ name: collectionName }, { nameOnly: true })
        .toArray()

      if (existingCollections.length === 0) {
        return res.status(404).json({
          message: 'The selected collection does not exist',
        })
      }

      targetCollectionName = collectionName
    } else {
      db = req.app.locals.db
      targetCollectionName = 'students'
    }

    const targetCollection = db.collection(targetCollectionName)

    const documents = await targetCollection
      .find({})
      .limit(sampleSize)
      .toArray()

    const fields = inferSchema(documents)

    res.json({
      databaseName: db.databaseName,
      collection: targetCollectionName,
      sampleSize: documents.length,
      fields,
    })
  } catch (error) {
    console.error('Schema discovery failed:', error.message)
    res.status(500).json({
      message: 'Unable to discover collection schema',
    })
  }
})

export default router
