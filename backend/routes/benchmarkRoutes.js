
import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { getUserDatabase } from '../services/userConnectionService.js'
import { analyzeExecutionPlan } from '../utils/executionAnalyzer.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()
router.use(requireAuth)

const MAX_TEST_DOCUMENTS = 1000
const MAX_CANDIDATES = 6
const WARMUP_RUNS = 2
const MEASURED_RUNS = 7
const MAX_QUERY_TIME_MS = 5000

function badRequest(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function validateFilter(filter, depth = 0) {
  if (
    !filter ||
    typeof filter !== 'object' ||
    Array.isArray(filter) ||
    depth > 10
  ) {
    throw badRequest('Filter must be a JSON object with valid nesting.')
  }

  const allowedOperators = new Set([
    '$and', '$or', '$nor', '$eq', '$ne', '$gt', '$gte',
    '$lt', '$lte', '$in', '$nin', '$exists', '$regex',
    '$options', '$all', '$size',
  ])

  for (const [key, value] of Object.entries(filter)) {
    if (
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      !key ||
      key.length > 200
    ) {
      throw badRequest('Invalid filter field.')
    }

    if (key.startsWith('$')) {
      if (!allowedOperators.has(key)) {
        throw badRequest(`Unsupported filter operator: ${key}`)
      }

      if (['$and', '$or', '$nor'].includes(key)) {
        if (
          !Array.isArray(value) ||
          value.length === 0 ||
          value.length > 100
        ) {
          throw badRequest(`${key} requires a non-empty array of filters.`)
        }

        for (const item of value) {
          validateFilter(item, depth + 1)
        }
      }

      continue
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      validateFilter(value, depth + 1)
    }

    if (Array.isArray(value) && value.length > 100) {
      throw badRequest('Filter arrays cannot contain more than 100 values.')
    }
  }
}

function collectFields(filter) {
  const equality = []
  const range = []

  function visit(group) {
    for (const [field, condition] of Object.entries(group)) {
      if (field.startsWith('$')) {
        if (['$and', '$or', '$nor'].includes(field)) {
          for (const item of condition) visit(item)
        }
        continue
      }

      const operators =
        condition && typeof condition === 'object' && !Array.isArray(condition)
          ? Object.keys(condition)
          : []

      if (operators.some((operator) =>
        ['$gt', '$gte', '$lt', '$lte'].includes(operator)
      )) {
        range.push(field)
      } else {
        equality.push(field)
      }
    }
  }

  visit(filter)

  return {
    equality: [...new Set(equality)],
    range: [...new Set(range)],
  }
}

function generateCandidates(filter) {
  const { equality, range } = collectFields(filter)
  const candidates = []
  const seen = new Set()

  function add(fields, reason) {
    const uniqueFields = [...new Set(fields)]

    if (!uniqueFields.length || uniqueFields.length > 5) return

    const keys = Object.fromEntries(uniqueFields.map((field) => [field, 1]))
    const signature = JSON.stringify(keys)

    if (seen.has(signature)) return

    seen.add(signature)
    candidates.push({ keys, reason })
  }

  for (const field of equality) {
    add([field], `Single-field equality candidate for "${field}".`)
  }

  for (const field of range) {
    add([field], `Single-field range candidate for "${field}".`)
  }

  add(
    [...equality, ...range],
    'Compound candidate with equality fields before range fields.'
  )

  if (equality.length > 1) {
    add(
      [...equality].reverse().concat(range),
      'Alternative compound field ordering for comparison.'
    )
  }

  return candidates.slice(0, MAX_CANDIDATES)
}

function indexSignature(keys) {
  return JSON.stringify(Object.entries(keys))
}

function isSameIndex(a, b) {
  return indexSignature(a) === indexSignature(b)
}

function isCoveredByExistingIndex(candidate, indexes) {
  const candidateEntries = Object.entries(candidate)

  return indexes.some((index) => {
    const existingEntries = Object.entries(index.key)

    return (
      existingEntries.length >= candidateEntries.length &&
      candidateEntries.every(
        ([field, direction], position) =>
          existingEntries[position]?.[0] === field &&
          existingEntries[position]?.[1] === direction
      )
    )
  })
}


async function getTargetCollection(req, body) {
  const { connectionId, collection: collectionName } = body

  if (
    typeof connectionId !== 'string' ||
    !connectionId.trim() ||
    typeof collectionName !== 'string' ||
    !collectionName.trim()
  ) {
    throw badRequest('Connect a database and select a collection first.')
  }

  if (collectionName.length > 255 || collectionName.includes('\0')) {
    throw badRequest('Invalid collection name.')
  }

  const db = getUserDatabase(req.user.id, connectionId)

  if (!db) {
    throw badRequest(
      'Connection not found. Connect the database again.',
      404
    )
  }

  const found = await db
    .listCollections({ name: collectionName }, { nameOnly: true })
    .toArray()

  if (!found.length) {
    throw badRequest('The selected collection does not exist.', 404)
  }

  return {
    db,
    collection: db.collection(collectionName),
    collectionName,
  }
}


function percentile(sorted, p) {
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)

  if (lower === upper) return sorted[lower]

  return Number(
    (
      sorted[lower] * (1 - (position - lower)) +
      sorted[upper] * (position - lower)
    ).toFixed(2)
  )
}

async function measureQuery(collection, filter, hint) {
  const timings = []

  for (let i = 0; i < WARMUP_RUNS + MEASURED_RUNS; i++) {
    const start = performance.now()

    let cursor = collection
      .find(filter, { maxTimeMS: MAX_QUERY_TIME_MS })
      .limit(MAX_TEST_DOCUMENTS)

    if (hint) cursor = cursor.hint(hint)

    await cursor.toArray()

    if (i >= WARMUP_RUNS) {
      timings.push(Number((performance.now() - start).toFixed(2)))
    }
  }

  const sorted = [...timings].sort((a, b) => a - b)

  let explainQuery = collection
    .find(filter, { maxTimeMS: MAX_QUERY_TIME_MS })
    .limit(MAX_TEST_DOCUMENTS)

  if (hint) explainQuery = explainQuery.hint(hint)

  const explanation = await explainQuery.explain('executionStats')

  const q1 = percentile(sorted, 0.25)
  const q3 = percentile(sorted, 0.75)

  return {
    benchmark: {
      warmupRuns: WARMUP_RUNS,
      measuredRuns: timings.length,
      samplesMs: timings,
      medianLatencyMs: percentile(sorted, 0.5),
      q1LatencyMs: q1,
      q3LatencyMs: q3,
      iqrLatencyMs: Number((q3 - q1).toFixed(2)),
      minLatencyMs: sorted[0],
      maxLatencyMs: sorted[sorted.length - 1],
    },
    performance: analyzeExecutionPlan(explanation),
  }
}

function getSupportedIndexOptions(index) {
  const allowed = [
    'unique',
    'sparse',
    'expireAfterSeconds',
    'partialFilterExpression',
    'collation',
    'hidden',
    'weights',
    'default_language',
    'language_override',
    'wildcardProjection',
    'storageEngine',
  ]

  const options = {}

  for (const key of allowed) {
    if (index[key] !== undefined) options[key] = index[key]
  }

  if (index.name) options.name = index.name

  return options
}

async function createTemporaryCollection(db, sourceCollection, tempName) {
  const temporary = await db.createCollection(tempName)

  const sample = await sourceCollection
    .aggregate([{ $sample: { size: MAX_TEST_DOCUMENTS } }], {
      maxTimeMS: MAX_QUERY_TIME_MS,
    })
    .toArray()

  if (sample.length) {
    for (let i = 0; i < sample.length; i += 100) {
      await temporary.insertMany(sample.slice(i, i + 100), {
        ordered: true,
      })
    }
  }

  const sourceIndexes = await sourceCollection.listIndexes().toArray()
  const clonedIndexes = []

  for (const index of sourceIndexes) {
    if (index.name === '_id_') continue

    const values = Object.values(index.key)

    if (
      values.some((value) =>
        ![1, -1, 'text', '2dsphere', '2d', 'hashed', 'wildcard'].includes(value)
      )
    ) {
      continue
    }

    try {
      await temporary.createIndex(
        index.key,
        getSupportedIndexOptions(index)
      )
      clonedIndexes.push(index.name)
    } catch {
      throw new Error(
        `Could not reproduce existing index "${index.name}" on the test collection. Candidate results would be unreliable, so testing was stopped.`
      )
    }
  }

  return {
    temporary,
    sampleCount: sample.length,
    clonedIndexes,
  }
}

async function runCandidateBenchmarks(db, sourceCollection, filter) {
  const candidates = generateCandidates(filter)

  if (!candidates.length) {
    throw badRequest(
      'No candidate indexes could be generated. Add field conditions to your filter.'
    )
  }

  const originalIndexes = await sourceCollection.listIndexes().toArray()

  for (const candidate of candidates) {
    candidate.coveredByExistingIndex = isCoveredByExistingIndex(
      candidate.keys,
      originalIndexes
    )
  }

  const eligible = candidates.filter(
    (candidate) => !candidate.coveredByExistingIndex
  )

  if (!eligible.length) {
    return {
      candidates: candidates.map((candidate) => ({
        ...candidate,
        status: 'already_covered',
        message: 'An existing index already covers this candidate.',
      })),
      sampleCount: 0,
      note: 'All generated candidates are covered by existing indexes.',
    }
  }

  const tempName = `__datalens_test_${randomUUID().replaceAll('-', '')}`
  let temporaryCreated = false

  try {
    const setup = await createTemporaryCollection(
      db,
      sourceCollection,
      tempName
    )

    temporaryCreated = true

    const temporary = setup.temporary
    const results = []

    for (const candidate of candidates) {
      if (candidate.coveredByExistingIndex) {
        results.push({
          ...candidate,
          status: 'already_covered',
          message: 'An existing index already covers this candidate.',
        })
        continue
      }

      try {
        const before = await measureQuery(
          temporary,
          filter,
          { $natural: 1 }
        )

        await temporary.createIndex(candidate.keys)

        let after

        try {
          after = await measureQuery(
            temporary,
            filter,
            candidate.keys
          )
        } finally {
          const candidateIndex = await temporary
            .listIndexes()
            .toArray()

          for (const index of candidateIndex) {
            if (
              index.name !== '_id_' &&
              isSameIndex(index.key, candidate.keys) &&
              !setup.clonedIndexes.includes(index.name)
            ) {
              await temporary.dropIndex(index.name).catch(() => {})
            }
          }
        }

        const beforeLatency = before.benchmark.medianLatencyMs
        const afterLatency = after.benchmark.medianLatencyMs

        results.push({
          ...candidate,
          status: 'tested',
          before,
          after,
          latencyChangePercent:
            beforeLatency > 0
              ? Number(
                  (
                    ((beforeLatency - afterLatency) / beforeLatency) *
                    100
                  ).toFixed(2)
                )
              : null,
          documentsExaminedChange:
            before.performance.totalDocsExamined -
            after.performance.totalDocsExamined,
        })
      } catch (error) {
        results.push({
          ...candidate,
          status: 'failed',
          message: error.message,
        })
      }
    }

    const tested = results
      .filter((item) => item.status === 'tested')
      .sort(
        (a, b) =>
          a.after.benchmark.medianLatencyMs -
          b.after.benchmark.medianLatencyMs
      )

    return {
      candidates: results.map((candidate) => ({
        ...candidate,
        rank:
          candidate.status === 'tested'
            ? tested.findIndex(
                (item) =>
                  indexSignature(item.keys) === indexSignature(candidate.keys)
              ) + 1
            : null,
      })),
      sampleCount: setup.sampleCount,
      clonedIndexes: setup.clonedIndexes,
      note:
        'Benchmarks use a sampled temporary copy. Candidate queries are forced to use their tested index. Results are approximate and may differ on the original collection.',
    }
  } finally {
    if (temporaryCreated) {
      await db.dropCollection(tempName).catch((error) => {
        console.error(
          'Could not clean up temporary DataLens collection:',
          tempName,
          error.message
        )
      })
    }
  }
}

router.post('/benchmarks/run', async (req, res) => {
  try {
    validateFilter(req.body.filter)

    const { db, collection, collectionName } =
      await getTargetCollection(req, req.body)

    const result = await measureQuery(collection, req.body.filter)

    res.json({
      databaseName: db.databaseName,
      collection: collectionName,
      filter: req.body.filter,
      ...result,
      measuredAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Benchmark failed:', error.message)

    res.status(error.status || 500).json({
      message: error.status ? error.message : 'Benchmark execution failed.',
    })
  }
})

router.post('/benchmarks/candidates', async (req, res) => {
  try {
    validateFilter(req.body.filter)

    const { db, collection, collectionName } =
      await getTargetCollection(req, req.body)

    const result = await runCandidateBenchmarks(
      db,
      collection,
      req.body.filter
    )

    res.json({
      databaseName: db.databaseName,
      collection: collectionName,
      filter: req.body.filter,
      ...result,
      measuredAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Candidate benchmarking failed:', error.message)

    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Candidate benchmarking failed. Check temporary collection permissions and database capacity.',
    })
  }
})

router.post('/benchmarks/apply-index', async (req, res) => {
  try {
    const { candidateIndex, filter } = req.body

    validateFilter(filter)

    if (
      !candidateIndex ||
      typeof candidateIndex !== 'object' ||
      Array.isArray(candidateIndex)
    ) {
      throw badRequest('Select a valid candidate index first.')
    }

    const entries = Object.entries(candidateIndex)

    if (
      entries.length === 0 ||
      entries.length > 5 ||
      entries.some(([field, direction]) =>
        !field ||
        field.startsWith('$') ||
        ['__proto__', 'prototype', 'constructor'].includes(field) ||
        ![1, -1].includes(direction)
      )
    ) {
      throw badRequest('The selected candidate index is invalid.')
    }

    const allowedCandidates = generateCandidates(filter)

    if (
      !allowedCandidates.some((candidate) =>
        isSameIndex(candidate.keys, candidateIndex)
      )
    ) {
      throw badRequest(
        'The selected index does not match a candidate generated for this filter.'
      )
    }

    const { db, collection, collectionName } =
      await getTargetCollection(req, req.body)

    const existingIndexes = await collection.listIndexes().toArray()

    if (
      existingIndexes.some((index) =>
        isSameIndex(index.key, candidateIndex)
      )
    ) {
      return res.status(409).json({
        message: 'This index already exists on the original collection.',
      })
    }

    const indexName = await collection.createIndex(candidateIndex)

    res.json({
      databaseName: db.databaseName,
      collection: collectionName,
      candidateIndex,
      indexName,
      message: 'The selected index was created on the original collection.',
      appliedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Applying candidate index failed:', error.message)

    res.status(error.status || 500).json({
      message: error.status
        ? error.message
        : 'Could not create the selected index on the original collection.',
    })
  }
})

export default router
