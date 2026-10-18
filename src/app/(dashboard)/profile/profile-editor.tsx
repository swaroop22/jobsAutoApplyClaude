"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Profile, ParsedProfile } from "@/db/schema/profiles";

type EditableExperience = ParsedProfile["experience"][number];
type EditableEducation = ParsedProfile["education"][number];

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(profile.fullName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [location, setLocation] = useState(profile.location ?? "");
  const [remotePreference, setRemotePreference] = useState(
    profile.remotePreference ?? "any",
  );
  const [workAuthorization, setWorkAuthorization] = useState(
    profile.workAuthorization ?? "",
  );
  const [visaSponsorshipNeeded, setVisaSponsorshipNeeded] = useState(
    profile.visaSponsorshipNeeded ?? false,
  );
  const [salaryMin, setSalaryMin] = useState(profile.salaryMin?.toString() ?? "");
  const [salaryMax, setSalaryMax] = useState(profile.salaryMax?.toString() ?? "");

  const [experience, setExperience] = useState<EditableExperience[]>(
    profile.parsedJson.experience,
  );
  const [education, setEducation] = useState<EditableEducation[]>(
    profile.parsedJson.education,
  );
  const [skills, setSkills] = useState(profile.parsedJson.skills.join(", "));
  const [certifications, setCertifications] = useState(
    profile.parsedJson.certifications.join(", "),
  );

  function updateExperience(index: number, patch: Partial<EditableExperience>) {
    setExperience((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function updateExperienceBullets(index: number, bulletsText: string) {
    updateExperience(index, {
      bullets: bulletsText.split("\n").map((b) => b.trim()).filter(Boolean),
    });
  }

  function updateEducation(index: number, patch: Partial<EditableEducation>) {
    setEducation((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName || null,
          phone: phone || null,
          location: location || null,
          remotePreference,
          workAuthorization: workAuthorization || null,
          visaSponsorshipNeeded,
          salaryMin: salaryMin ? Number(salaryMin) : null,
          salaryMax: salaryMax ? Number(salaryMax) : null,
          parsedJson: {
            experience,
            education,
            skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
            certifications: certifications
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Save failed");
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Contact & preferences</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location</Label>
            <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Remote preference</Label>
            <Select
              value={remotePreference}
              onValueChange={(value) => setRemotePreference(value ?? "any")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="remote">Remote</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="onsite">Onsite</SelectItem>
                <SelectItem value="any">Any</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workAuthorization">Work authorization</Label>
            <Input
              id="workAuthorization"
              value={workAuthorization}
              onChange={(e) => setWorkAuthorization(e.target.value)}
              placeholder="e.g. US Citizen, H-1B, requires sponsorship"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox
              id="visaSponsorship"
              checked={visaSponsorshipNeeded}
              onCheckedChange={(checked) => setVisaSponsorshipNeeded(checked === true)}
            />
            <Label htmlFor="visaSponsorship">Requires visa sponsorship</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salaryMin">Min salary expectation</Label>
            <Input
              id="salaryMin"
              type="number"
              value={salaryMin}
              onChange={(e) => setSalaryMin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="salaryMax">Max salary expectation</Label>
            <Input
              id="salaryMax"
              type="number"
              value={salaryMax}
              onChange={(e) => setSalaryMax(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {experience.map((exp, i) => (
            <div key={i} className="space-y-2 border-b pb-4 last:border-b-0 last:pb-0">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  value={exp.title}
                  onChange={(e) => updateExperience(i, { title: e.target.value })}
                  placeholder="Title"
                />
                <Input
                  value={exp.company}
                  onChange={(e) => updateExperience(i, { company: e.target.value })}
                  placeholder="Company"
                />
                <Input
                  value={exp.startDate}
                  onChange={(e) => updateExperience(i, { startDate: e.target.value })}
                  placeholder="Start date"
                />
                <Input
                  value={exp.endDate ?? ""}
                  onChange={(e) => updateExperience(i, { endDate: e.target.value || null })}
                  placeholder="End date (blank = current)"
                />
              </div>
              <Textarea
                value={exp.bullets.join("\n")}
                onChange={(e) => updateExperienceBullets(i, e.target.value)}
                placeholder="One bullet per line"
                rows={4}
              />
            </div>
          ))}
          {experience.length === 0 && (
            <p className="text-sm text-muted-foreground">No experience parsed.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Education</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {education.map((edu, i) => (
            <div key={i} className="grid grid-cols-2 gap-3">
              <Input
                value={edu.school}
                onChange={(e) => updateEducation(i, { school: e.target.value })}
                placeholder="School"
              />
              <Input
                value={edu.degree}
                onChange={(e) => updateEducation(i, { degree: e.target.value })}
                placeholder="Degree"
              />
              <Input
                value={edu.field}
                onChange={(e) => updateEducation(i, { field: e.target.value })}
                placeholder="Field of study"
              />
              <Input
                type="number"
                value={edu.graduationYear ?? ""}
                onChange={(e) =>
                  updateEducation(i, {
                    graduationYear: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="Graduation year"
              />
            </div>
          ))}
          {education.length === 0 && (
            <p className="text-sm text-muted-foreground">No education parsed.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills & certifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="skills">Skills (comma-separated)</Label>
            <Textarea id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="certifications">Certifications (comma-separated)</Label>
            <Textarea
              id="certifications"
              value={certifications}
              onChange={(e) => setCertifications(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
