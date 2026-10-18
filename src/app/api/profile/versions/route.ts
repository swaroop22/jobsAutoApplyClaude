import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const versions = await db
    .select({
      id: profiles.id,
      version: profiles.version,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version));

  return NextResponse.json({ versions });
}
