import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/current-user";
import { ResumeUploader } from "./resume-uploader";
import { ProfileEditor } from "./profile-editor";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const [latestProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .orderBy(desc(profiles.version))
    .limit(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ResumeUploader />
      {latestProfile ? (
        <ProfileEditor profile={latestProfile} key={latestProfile.id} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Upload a resume above to generate your profile.
        </p>
      )}
    </div>
  );
}
