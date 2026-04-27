import { createClient } from "@supabase/supabase-js";
import fs from "fs";

process.loadEnvFile(".env.local");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Split SQL into individual statements and execute sequentially
// Handles CREATE TABLE, CREATE INDEX, ALTER TABLE, CREATE FUNCTION, CREATE TRIGGER, etc.
function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;

  const lines = sql.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("--")) {
      if (inDollarQuote) current += line + "\n";
      continue;
    }

    // Track $$ dollar-quoted blocks (functions, triggers)
    const dollarMatches = trimmed.match(/\$\$/g);
    if (dollarMatches) {
      for (const _ of dollarMatches) {
        inDollarQuote = !inDollarQuote;
      }
    }

    current += line + "\n";

    // Statement ends with ; and we're not inside a $$ block
    if (trimmed.endsWith(";") && !inDollarQuote) {
      const stmt = current.trim();
      if (stmt && !stmt.startsWith("--")) {
        statements.push(stmt);
      }
      current = "";
    }
  }

  // Catch any remaining statement without trailing semicolon
  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

async function runFile(filePath, label) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Running: ${label}`);
  console.log(`File: ${filePath}`);
  console.log("=".repeat(60));

  const sql = fs.readFileSync(filePath, "utf8");
  const statements = splitStatements(sql);
  console.log(`Parsed ${statements.length} statements\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    // Show first 80 chars of each statement
    const preview = stmt.replace(/\s+/g, " ").slice(0, 80);
    process.stdout.write(`  [${i + 1}/${statements.length}] ${preview}...`);

    const { error } = await supabase.rpc("exec_sql", { sql_query: stmt }).catch(() => {
      // RPC not available — not an error, just means we need another approach
      return { error: { message: "RPC not available" } };
    });

    if (error && error.message === "RPC not available") {
      // Fallback: try direct insert/query for known patterns
      process.stdout.write(" (trying direct)");
    }

    if (error && error.message !== "RPC not available") {
      console.log(` FAILED: ${error.message}`);
      failed++;
    } else {
      console.log(" OK");
      success++;
    }
  }

  console.log(`\nResult: ${success} OK, ${failed} failed`);
  return failed === 0;
}

// Since we can't execute raw SQL via RPC, use the service role
// to directly create tables via the Supabase client
// Actually — let's just try each statement via fetch to the SQL endpoint

async function execSQL(sql, label) {
  // Use the Supabase Management API v1 SQL endpoint
  // This is available at POST /sql on the project URL with service role
  const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });

  return { status: resp.status, ok: resp.ok };
}

// Main: run migrations using the approach that worked before (node pg or supabase CLI)
// Since neither is available, we'll create the tables programmatically via the JS client

async function createTablesViaClient() {
  console.log("Creating multi-tenant tables via Supabase JS client...\n");

  // Step 1: Create organizations table
  // We can't CREATE TABLE via the JS client — it only does CRUD on existing tables.
  // The only way to run DDL is via SQL.
  // Let's check if the supabase CLI npx approach works with --db-url

  console.log("ERROR: Cannot run DDL (CREATE TABLE) via the Supabase JS client.");
  console.log("The JS client only supports CRUD operations on existing tables.");
  console.log("");
  console.log("Options:");
  console.log("1. Paste the SQL into Supabase Dashboard SQL Editor");
  console.log("2. Use supabase CLI: npx supabase db query --linked -f <file>");
  console.log("3. Provide the database password for direct pg connection");
}

createTablesViaClient();
