import { Router } from "express";
import { analyzeExecutionPlan } from "../utils/executionAnalyzer.js";
import { getUserDatabase } from "../services/userConnectionService.js";
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router();
router.use(requireAuth)

const allowedOperators = new Set([
  "$and",
  "$or",
  "$nor",
  "$eq",
  "$ne",
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$in",
  "$nin",
  "$exists",
  "$regex",
  "$options",
  "$all",
  "$size",
]);

const logicalOperators = new Set(["$and", "$or", "$nor"]);
const rangeOperators = new Set(["$gt", "$gte", "$lt", "$lte"]);
const MAX_CANDIDATES = 8;

function validateFilter(filter, depth = 0) {
  if (
    !filter ||
    typeof filter !== "object" ||
    Array.isArray(filter) ||
    depth > 10
  ) {
    throw new Error("Filter must be a JSON object with valid nesting.");
  }

  for (const [key, value] of Object.entries(filter)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) {
      throw new Error("Invalid filter field.");
    }

    if (key.startsWith("$")) {
      if (!allowedOperators.has(key)) {
        throw new Error(`Unsupported filter operator: ${key}`);
      }

      if (logicalOperators.has(key)) {
        if (!Array.isArray(value) || value.length === 0 || value.length > 100) {
          throw new Error(`${key} requires a non-empty array of filters.`);
        }

        for (const item of value) {
          validateFilter(item, depth + 1);
        }
      }

      continue;
    }

    if (!key || key.length > 200) {
      throw new Error("Invalid filter field name.");
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      validateFilter(value, depth + 1);
    }

    if (Array.isArray(value) && value.length > 100) {
      throw new Error("Filter arrays cannot contain more than 100 values.");
    }
  }
}

function getFieldType(condition) {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const operators = Object.keys(condition);

    if (operators.some((operator) => rangeOperators.has(operator))) {
      return "range";
    }
  }

  return "equality";
}

function collectFieldTypes(filter) {
  const fields = new Map();

  function visit(group) {
    for (const [field, condition] of Object.entries(group)) {
      if (logicalOperators.has(field)) {
        if (Array.isArray(condition)) {
          condition.forEach(visit);
        }
        continue;
      }

      if (field.startsWith("$")) {
        continue;
      }

      if (!fields.has(field)) {
        fields.set(field, getFieldType(condition));
      } else if (getFieldType(condition) === "equality") {
        fields.set(field, "equality");
      }
    }
  }

  visit(filter);

  return fields;
}

function makeIndex(fields) {
  return Object.fromEntries(fields.map((field) => [field, 1]));
}

function indexSignature(keys) {
  return JSON.stringify(Object.entries(keys));
}

function isCoveredByExistingIndex(candidate, existingIndexes) {
  const candidateKeys = Object.entries(candidate);

  return existingIndexes.some((index) => {
    const existingKeys = Object.entries(index.keys);

    if (existingKeys.length < candidateKeys.length) {
      return false;
    }

    return candidateKeys.every(
      ([field, direction], position) =>
        existingKeys[position]?.[0] === field &&
        existingKeys[position]?.[1] === direction,
    );
  });
}

function generateCandidateIndexes(filter, existingIndexes) {
  const fieldTypes = collectFieldTypes(filter);

  const equalityFields = [...fieldTypes.entries()]
    .filter(([, type]) => type === "equality")
    .map(([field]) => field)
    .sort();

  const rangeFields = [...fieldTypes.entries()]
    .filter(([, type]) => type === "range")
    .map(([field]) => field)
    .sort();

  const candidates = [];
  const seen = new Set();

  function addCandidate(fields) {
    if (!fields.length || candidates.length >= MAX_CANDIDATES) {
      return;
    }

    const keys = makeIndex(fields);
    const signature = indexSignature(keys);

    if (seen.has(signature)) {
      return;
    }

    seen.add(signature);

    candidates.push({
      keys,
      coveredByExistingIndex: isCoveredByExistingIndex(keys, existingIndexes),
      reason:
        fields.length === 1
          ? `Single-field candidate for ${fields[0]}.`
          : "Compound candidate with equality fields before range fields.",
    });
  }

  const allFields = [...equalityFields, ...rangeFields];

  for (const field of allFields) {
    addCandidate([field]);
  }

  addCandidate(allFields);

  if (equalityFields.length > 1 && candidates.length < MAX_CANDIDATES) {
    addCandidate([...equalityFields, ...rangeFields]);
  }

  if (
    equalityFields.length > 0 &&
    rangeFields.length > 0 &&
    candidates.length < MAX_CANDIDATES
  ) {
    addCandidate([...rangeFields, ...equalityFields]);
  }

  return candidates;
}

router.post("/index-advisor", async (req, res) => {
  try {
    const { connectionId, collection: collectionName, filter } = req.body;

    if (
      typeof connectionId !== "string" ||
      !connectionId.trim() ||
      typeof collectionName !== "string" ||
      !collectionName.trim()
    ) {
      return res.status(400).json({
        message: "Connect a database and select a collection first.",
      });
    }

    try {
      validateFilter(filter);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const db = getUserDatabase(req.user.id, connectionId)

    if (!db) {
      return res.status(404).json({
        message: "Connection not found. Connect the database again.",
      });
    }

    const collections = await db
      .listCollections({ name: collectionName }, { nameOnly: true })
      .toArray();

    if (collections.length === 0) {
      return res.status(404).json({
        message: "The selected collection does not exist.",
      });
    }

    const targetCollection = db.collection(collectionName);

    const [explanation, indexes] = await Promise.all([
      targetCollection
        .find(filter, { maxTimeMS: 5000 })
        .limit(10)
        .explain("executionStats"),
      targetCollection.listIndexes().toArray(),
    ]);

    const performance = analyzeExecutionPlan(explanation);

    const existingIndexes = indexes.map((index) => ({
      name: index.name,
      keys: index.key,
    }));

    const candidates = generateCandidateIndexes(filter, existingIndexes);

    const candidateIndexes = candidates.map((candidate) => ({
      ...candidate,
      status: candidate.coveredByExistingIndex
        ? "index_exists"
        : performance.hasCollectionScan && performance.totalDocsExamined > 100
          ? "candidate_found"
          : "needs_benchmark",
    }));

    const availableCandidates = candidateIndexes.filter(
      (candidate) => !candidate.coveredByExistingIndex,
    );

    let recommendation;

    if (candidateIndexes.length === 0) {
      recommendation = {
        status: "insufficient_filter",
        message: "Add field conditions to identify possible index candidates.",
        candidateIndex: null,
        createIndexCommand: null,
      };
    } else if (availableCandidates.length === 0) {
      recommendation = {
        status: "index_exists",
        message: "Existing indexes already cover the generated candidates.",
        candidateIndex: null,
        createIndexCommand: null,
      };
    } else {
      recommendation = {
        status: "needs_benchmark",
        message:
          "Multiple candidate indexes are available. Benchmark them before selecting one.",
        candidateIndex: null,
        createIndexCommand: null,
      };
    }

    return res.json({
      databaseName: db.databaseName,
      collection: collectionName,
      filter,
      performance,
      existingIndexes,
      candidateIndexes,
      availableCandidates,
      recommendation,
    });
  } catch (error) {
    console.error("Index advisor failed:", error.message);

    return res.status(500).json({
      message: "Index advisor analysis failed.",
    });
  }
});

export default router;
