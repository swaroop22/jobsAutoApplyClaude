"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { applications } from "@/db/schema";

type Application = typeof applications.$inferSelect;

export function ApplicationActions({ application }: { application: Application }) {
  const router = useRouter();
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (application.mode === "extension") {
    return (
      <p className="text-sm text-muted-foreground">
        This site doesn&apos;t support automated submission — use the browser
        extension to apply manually with your tailored materials.
      </p>
    );
  }

  if (application.status !== "pending_review") {
    return null;
  }

  async function handleApprove() {
    setIsApproving(true);
    setError(null);

    try {
      const res = await fetch(`/api/applications/${application.id}/approve`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to approve application");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve application");
    } finally {
      setIsApproving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleApprove} disabled={isApproving}>
        {isApproving ? "Submitting..." : "Approve & submit"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
