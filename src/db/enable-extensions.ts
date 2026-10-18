import "dotenv/config";
import postgres from "postgres";

// pgvector must exist before drizzle-kit can create `vector` columns.
// Supabase ships the extension but it's disabled by default per-project.
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  await sql`CREATE EXTENSION IF NOT EXISTS vector;`;
  await sql.end();
  console.log("pgvector extension enabled.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
