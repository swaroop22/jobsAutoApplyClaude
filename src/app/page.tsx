import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">JobsAutoApply</h1>
      <p className="max-w-md text-muted-foreground">
        Quality over quantity — human-approved, ATS-compliant job applications
        with full transparency.
      </p>
      <div className="flex gap-3">
        <Button render={<Link href="/sign-up" />}>Get started</Button>
        <Button variant="outline" render={<Link href="/sign-in" />}>
          Sign in
        </Button>
      </div>
    </div>
  );
}
