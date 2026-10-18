import "dotenv/config";
import postgres from "postgres";

// ivfflat indexes aren't expressible in drizzle-kit's schema DSL; apply them
// once after the base tables exist (requires rows for ivfflat to size lists,
// but CREATE INDEX IF NOT EXISTS is safe to run against an empty table too).
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_embedding ON jobs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`;
  await sql`CREATE INDEX IF NOT EXISTS idx_profiles_embedding ON profiles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);`;
  await sql.end();
  console.log("Vector indexes applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
