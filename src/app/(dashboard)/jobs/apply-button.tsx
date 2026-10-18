"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ApplyButton({ jobId, atsType }: { jobId: string; atsType: string | null }) {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = atsType === "greenhouse" || atsType === "lever";

  async function handleApply() {
    setIsCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, mode: supported ? "review" : "extension" }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to start application");
      }

      router.push("/applications");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start application");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleApply} disabled={isCreating}>
        {isCreating ? "Starting..." : supported ? "Tailor & apply" : "Prepare for manual apply"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
