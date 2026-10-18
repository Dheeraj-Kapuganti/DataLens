
const INDEX_SCAN_STAGES = new Set([
  'IXSCAN',
  'EXPRESS_IXSCAN',
  'CLUSTERED_IXSCAN',
])

export function analyzeExecutionPlan(explanation) {
  function collectStages(node, stages = []) {
    if (!node || typeof node !== 'object') {
      return stages
    }

    if (typeof node.stage === 'string') {
      stages.push(node.stage)
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') {
        collectStages(value, stages)
      }
    }

    return stages
  }

  const stats = explanation.executionStats ?? {}

  const winningPlan = explanation.queryPlanner?.winningPlan
  const executionStages = stats.executionStages

  const stages = [
    ...new Set([
      ...collectStages(winningPlan),
      ...collectStages(executionStages),
    ]),
  ]

  const totalDocsExamined = stats.totalDocsExamined ?? 0
  const totalKeysExamined = stats.totalKeysExamined ?? 0
  const nReturned = stats.nReturned ?? 0
  const executionTimeMillis = stats.executionTimeMillis ?? 0

  const scanRatio = Number(
    (totalDocsExamined / Math.max(1, nReturned)).toFixed(2)
  )

  const hasCollectionScan = stages.includes('COLLSCAN')
  const usesIndexScan = stages.some((stage) =>
    INDEX_SCAN_STAGES.has(stage)
  )

  let assessment = 'Efficient'
  let reason = 'No obvious scan inefficiency was detected.'

  if (hasCollectionScan && totalDocsExamined > 100) {
    assessment = 'Needs investigation'
    reason =
      'MongoDB performed a collection scan and examined more than 100 documents. Check whether an index could reduce the work.'
  } else if (scanRatio > 10 && totalDocsExamined > 100) {
    assessment = 'Potentially inefficient'
    reason =
      'MongoDB examined many documents relative to the number returned. Investigate the filter and available indexes.'
  } else if (hasCollectionScan) {
    assessment = 'Collection scan'
    reason =
      'MongoDB used a collection scan. This can be reasonable for small collections or queries that match many documents.'
  } else if (usesIndexScan) {
    assessment = 'Index scan'
    reason =
      'MongoDB used an index scan. Check the examined-to-returned ratio to determine whether the index is selective enough.'
  }

  return {
    stages,
    hasCollectionScan,
    usesIndexScan,
    totalDocsExamined,
    totalKeysExamined,
    nReturned,
    executionTimeMillis,
    scanRatio,
    assessment,
    reason,
  }
}
