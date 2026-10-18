import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/current-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" render={<Link href="/profile" />}>
            Profile
          </Button>
          <UserButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {user ? (
            <>
              <p>Email: {user.email}</p>
              <p>Plan: {user.plan}</p>
            </>
          ) : (
            <p>
              Signed in with Clerk, but no matching row in the app database yet.
              This resolves once the Clerk webhook has synced your user — see
              /api/webhooks/clerk.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
