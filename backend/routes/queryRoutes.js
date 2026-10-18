import { Router } from "express";
import { ObjectId } from "mongodb";
import { analyzeExecutionPlan } from "../utils/executionAnalyzer.js";
import { getUserDatabase } from "../services/userConnectionService.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

const logicalOperators = new Set(["$and", "$or", "$nor"]);

const fieldOperators = new Set([
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

const regexOptions = new Set(["i", "m", "s", "x"]);

const MAX_DEPTH = 10;
const MAX_NODES = 100;
const MAX_ARRAY_LENGTH = 100;
const MAX_STRING_LENGTH = 1000;

function isValidFieldPath(field) {
  return (
    typeof field === "string" &&
    field.length > 0 &&
    field.length <= 200 &&
    field
      .split(".")
      .every(
        (part) =>
          part.length > 0 &&
          !["__proto__", "prototype", "constructor"].includes(part),
      )
  );
}

function normalizeValue(value, state, depth = 0) {
  state.nodes += 1;

  if (state.nodes > MAX_NODES) {
    throw new Error("Filter contains too many values");
  }

  if (depth > MAX_DEPTH) {
    throw new Error("Filter nesting is too deep");
  }

  if (value === null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Numeric values must be finite");
    }

    return value;
  }

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      throw new Error("String values are too long");
    }

    return value;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      throw new Error("Arrays contain too many values");
    }

    return value.map((item) => normalizeValue(item, state, depth + 1));
  }

  if (!value || typeof value !== "object") {
    throw new Error("Unsupported filter value");
  }

  const keys = Object.keys(value);

  if (keys.length === 1 && keys[0] === "$oid") {
    if (
      typeof value.$oid !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(value.$oid)
    ) {
      throw new Error("$oid must contain a valid 24-character ObjectId");
    }

    return new ObjectId(value.$oid);
  }

  if (keys.length === 1 && keys[0] === "$date") {
    if (
      typeof value.$date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T/.test(value.$date)
    ) {
      throw new Error("$date must be an ISO 8601 date-time string");
    }

    const date = new Date(value.$date);

    if (Number.isNaN(date.getTime())) {
      throw new Error("$date is invalid");
    }

    return date;
  }

  const result = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key.startsWith("$") || !isValidFieldPath(key)) {
      throw new Error(
        "Nested objects must use valid field names or explicit BSON wrappers",
      );
    }

    result[key] = normalizeValue(nestedValue, state, depth + 1);
  }

  return result;
}

function normalizeCondition(condition, state, depth = 0) {
  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    Object.keys(condition).length === 1 &&
    Object.hasOwn(condition, "$oid")
  ) {
    return normalizeValue(condition, state, depth);
  }

  if (
    condition &&
    typeof condition === "object" &&
    !Array.isArray(condition) &&
    Object.keys(condition).length === 1 &&
    Object.hasOwn(condition, "$date")
  ) {
    return normalizeValue(condition, state, depth);
  }

  if (
    !condition ||
    typeof condition !== "object" ||
    Array.isArray(condition) ||
    condition instanceof Date ||
    condition instanceof ObjectId
  ) {
    return normalizeValue(condition, state, depth);
  }

  const keys = Object.keys(condition);

  const isOperatorDocument =
    keys.length > 0 && keys.every((key) => key.startsWith("$"));

  if (!isOperatorDocument) {
    return normalizeValue(condition, state, depth);
  }

  const result = {};

  for (const [operator, operand] of Object.entries(condition)) {
    if (!fieldOperators.has(operator)) {
      throw new Error(`Unsupported field operator: ${operator}`);
    }

    if (operator === "$exists") {
      if (typeof operand !== "boolean") {
        throw new Error("$exists requires a boolean");
      }

      result[operator] = operand;
      continue;
    }

    if (operator === "$size") {
      if (!Number.isInteger(operand) || operand < 0) {
        throw new Error("$size requires a non-negative integer");
      }

      result[operator] = operand;
      continue;
    }

    if (operator === "$options") {
      if (
        typeof operand !== "string" ||
        [...operand].some((option) => !regexOptions.has(option))
      ) {
        throw new Error("Unsupported regular expression options");
      }

      result[operator] = operand;
      continue;
    }

    if (operator === "$regex") {
      if (typeof operand !== "string" || operand.length > 200) {
        throw new Error("$regex requires a string of at most 200 characters");
      }

      result[operator] = operand;
      continue;
    }

    if (["$in", "$nin", "$all"].includes(operator)) {
      if (!Array.isArray(operand) || operand.length > MAX_ARRAY_LENGTH) {
        throw new Error(`${operator} requires an array of at most 100 values`);
      }

      result[operator] = operand.map((item) =>
        normalizeValue(item, state, depth + 1),
      );
      continue;
    }

    const normalized = normalizeValue(operand, state, depth + 1);

    if (
      ["$gt", "$gte", "$lt", "$lte"].includes(operator) &&
      normalized !== null &&
      typeof normalized === "object" &&
      !(normalized instanceof Date) &&
      !(normalized instanceof ObjectId)
    ) {
      throw new Error(`${operator} requires a scalar value`);
    }

    result[operator] = normalized;
  }

  if (result.$regex !== undefined && result.$options === undefined) {
    result.$options = "";
  }

  return result;
}

function normalizeFilter(filter, state, depth = 0) {
  if (
    !filter ||
    typeof filter !== "object" ||
    Array.isArray(filter) ||
    filter instanceof Date ||
    filter instanceof ObjectId
  ) {
    throw new Error("Each filter group must be a JSON object");
  }

  if (depth > MAX_DEPTH) {
    throw new Error("Filter nesting is too deep");
  }

  const result = {};

  for (const [key, value] of Object.entries(filter)) {
    if (logicalOperators.has(key)) {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.length > MAX_ARRAY_LENGTH
      ) {
        throw new Error(`${key} requires a non-empty array of filter objects`);
      }

      result[key] = value.map((item) =>
        normalizeFilter(item, state, depth + 1),
      );

      continue;
    }

    if (key.startsWith("$")) {
      throw new Error(`Unsupported logical operator: ${key}`);
    }

    if (!isValidFieldPath(key)) {
      throw new Error(`Invalid field name: ${key}`);
    }

    result[key] = normalizeCondition(value, state, depth + 1);
  }

  return result;
}

router.post("/query", async (req, res) => {
  try {
    const { connectionId, collection: collectionName, filter = {} } = req.body;

    const page = Number(req.body.page ?? 1);
    const limit = Number(req.body.limit ?? 10);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        message: "Invalid page number",
      });
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return res.status(400).json({
        message: "Limit must be between 1 and 100",
      });
    }

    let validatedFilter;

    try {
      validatedFilter = normalizeFilter(filter, { nodes: 0 });
    } catch (error) {
      return res.status(400).json({
        message: error.message,
      });
    }

    let db;
    let targetCollectionName;

    if (
      typeof connectionId !== "string" ||
      !connectionId ||
      typeof collectionName !== "string" ||
      !collectionName.trim()
    ) {
      return res.status(400).json({
        message: "A valid connection ID and collection are required",
      });
    }

    db = getUserDatabase(req.user.id, connectionId);

    if (!db) {
      return res.status(404).json({
        message: "Connection not found. Connect the database again.",
      });
    }

    const existingCollections = await db
      .listCollections({ name: collectionName }, { nameOnly: true })
      .toArray();

    if (existingCollections.length === 0) {
      return res.status(404).json({
        message: "The selected collection does not exist",
      });
    }

    targetCollectionName = collectionName;

    const targetCollection = db.collection(targetCollectionName);
    const skip = (page - 1) * limit;

    const totalDocuments = await targetCollection.countDocuments(
      validatedFilter,
      { maxTimeMS: 5000 },
    );

    const start = performance.now();

    const results = await targetCollection
      .find(validatedFilter, { maxTimeMS: 5000 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const latencyMs = Number((performance.now() - start).toFixed(2));

    const explanation = await targetCollection
      .find(validatedFilter, { maxTimeMS: 5000 })
      .skip(skip)
      .limit(limit)
      .explain("executionStats");
    console.dir(explanation, { depth: null });

    const performanceAnalysis = analyzeExecutionPlan(explanation);

    try {
      await req.app.locals.db.collection("query_history").insertOne({
        userId: req.user.id,
        connectionId: connectionId ?? null,
        databaseName: db.databaseName,
        collectionName: targetCollectionName,
        filter: req.body.filter ?? {},
        page,
        limit,
        latencyMs,
        performance: performanceAnalysis,
        executedAt: new Date(),
      });
    } catch (historyError) {
      console.error("Failed to save query history:", historyError.message);
    }

    return res.json({
      databaseName: db.databaseName,
      collection: targetCollectionName,
      filter: req.body.filter ?? {},
      results,
      pagination: {
        page,
        limit,
        totalDocuments,
        totalPages: Math.ceil(totalDocuments / limit),
      },
      performance: {
        ...performanceAnalysis,
        latencyMs,
      },
    });
  } catch (error) {
    console.error("Query analysis failed:", error.message);

    return res.status(500).json({
      message: "Query analysis failed",
    });
  }
});

router.get("/query-history", async (req, res) => {
  try {
    const history = await req.app.locals.db
      .collection("query_history")
      .find({userId: req.user.id})
      .sort({ executedAt: -1 })
      .limit(100)
      .toArray();

    res.json(history);
  } catch (error) {
    console.error("Failed to fetch query history:", error.message);

    res.status(500).json({
      message: "Failed to fetch query history",
    });
  }
});

export default router;
