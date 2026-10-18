import "dotenv/config";
import { db } from "./client";
import { jobSources } from "./schema";

// One-off seed for initial ATS sources to ingest from. Add more boards/sites
// here as you identify companies using Greenhouse/Lever's public job boards.
const SOURCES: Array<{ name: string; type: string; configJson: Record<string, string> }> = [
  { name: "greenhouse-stripe", type: "greenhouse", configJson: { boardToken: "stripe" } },
  { name: "lever-palantir", type: "lever", configJson: { site: "palantir" } },
];

async function main() {
  for (const source of SOURCES) {
    await db.insert(jobSources).values(source);
  }
  console.log(`Seeded ${SOURCES.length} job sources.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
