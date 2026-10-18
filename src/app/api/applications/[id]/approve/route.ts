import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import { applications } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { inngest } from "@/inngest/client";

// Review-mode applications only submit once the user explicitly approves the
// tailored resume + cover letter shown to them. This is the only path that
// moves a "pending_review" application toward actually being sent.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [application] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, user.id)))
    .limit(1);

  if (!application) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (application.status !== "pending_review") {
    return NextResponse.json(
      { error: `Application is in status "${application.status}", not pending_review.` },
      { status: 409 },
    );
  }

  if (application.mode === "extension") {
    return NextResponse.json(
      { error: "Extension-mode applications are submitted by the user in-browser, not approved here." },
      { status: 400 },
    );
  }

  const [updated] = await db
    .update(applications)
    .set({ status: "approved", updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning();

  await inngest.send({ name: "application/approved", data: { applicationId: id } });

  return NextResponse.json({ application: updated });
}
