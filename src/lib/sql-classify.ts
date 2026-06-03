/**
 * SQL classifier — decides whether a query is read-only or a write/dangerous
 * operation. Pure and dependency-free so it runs identically on the client
 * (to drive the confirmation modal) and on the server (authoritative gate).
 *
 * The classifier errs toward "write": an unrecognized leading keyword is
 * treated as a write so it requires confirmation rather than running silently.
 */

export type QueryCategory = "read" | "write";

export interface QueryClassification {
  category: QueryCategory;
  /** The leading keyword of each statement, e.g. ["SELECT"] or ["UPDATE","SELECT"]. */
  statements: string[];
  /** Dangerous keywords detected (for display in the confirmation modal). */
  dangerousKeywords: string[];
}

// Leading keywords that are always read-only.
const READ_KEYWORDS = new Set([
  "SELECT",
  "SHOW",
  "TABLE",
  "VALUES",
  "FETCH",
  // session/utility statements that don't modify data
  "SET",
  "RESET",
  "BEGIN",
  "COMMIT",
  "ROLLBACK",
  "START",
  "SAVEPOINT",
  "RELEASE",
  "DISCARD",
  "DECLARE",
  "CLOSE",
]);

// Leading keywords that mutate data, schema, or privileges → dangerous.
const WRITE_KEYWORDS = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "GRANT",
  "REVOKE",
  "MERGE",
  "REINDEX",
  "VACUUM",
  "CLUSTER",
  "REFRESH",
  "COPY",
  "CALL",
  "DO",
  "COMMENT",
  "SECURITY",
  "CHECKPOINT",
  "LOCK",
]);

/** Remove comments and string/identifier literals so keyword scanning is safe. */
function stripNoise(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ") // line comments
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/'(?:''|[^'])*'/g, "''") // string literals
    .replace(/"(?:""|[^"])*"/g, '""') // quoted identifiers
    .replace(/\$\$[\s\S]*?\$\$/g, " "); // dollar-quoted bodies
}

function firstKeyword(statement: string): string | null {
  const m = statement.trim().match(/^([a-zA-Z]+)/);
  return m ? m[1].toUpperCase() : null;
}

/** Does the (already noise-stripped) text contain any write keyword as a word? */
function findWriteKeywords(text: string): string[] {
  const found = new Set<string>();
  for (const kw of WRITE_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(text)) found.add(kw);
  }
  return [...found];
}

export function classifyQuery(rawSql: string): QueryClassification {
  const clean = stripNoise(rawSql);
  const statements = clean
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  if (statements.length === 0) {
    return { category: "read", statements: [], dangerousKeywords: [] };
  }

  const leadKeywords: string[] = [];
  const dangerous = new Set<string>();

  for (const stmt of statements) {
    const kw = firstKeyword(stmt);
    leadKeywords.push(kw ?? "?");
    if (!kw) {
      dangerous.add("?");
      continue;
    }

    if (kw === "EXPLAIN") {
      // EXPLAIN ANALYZE actually executes the inner statement.
      if (/\bANALYZE\b/i.test(stmt)) {
        findWriteKeywords(stmt).forEach((k) => dangerous.add(k));
      }
      continue;
    }

    if (kw === "WITH") {
      // A CTE can contain INSERT/UPDATE/DELETE in its body.
      findWriteKeywords(stmt).forEach((k) => dangerous.add(k));
      continue;
    }

    if (READ_KEYWORDS.has(kw)) continue;

    if (WRITE_KEYWORDS.has(kw)) {
      dangerous.add(kw);
      continue;
    }

    // Unknown leading keyword → treat as dangerous (require confirmation).
    dangerous.add(kw);
  }

  return {
    category: dangerous.size > 0 ? "write" : "read",
    statements: leadKeywords,
    dangerousKeywords: [...dangerous],
  };
}
