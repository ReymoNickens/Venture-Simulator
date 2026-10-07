import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getWorkspace, listOfferings } from "@/lib/server/workspace";
import { joinGroup, upsertProfile } from "@/lib/server/mutations";
import { previewInvite, type InvitePreview } from "@/lib/server/invites";
import { forgetInvite, pendingInvite } from "@/lib/invite/pending";
import { formatPhone, isPhoneEmail } from "@/lib/phone";
import type { CourseOffering } from "@/lib/domain/types";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/badge";
import { FormMessages, Loading } from "@/components/ui/feedback";
import { LogoMark } from "@/components/ui/sticker";

export const Route = createFileRoute("/onboarding")({ component: Onboarding });

const classLabel = (o: CourseOffering) =>
  [o.courseCode, o.programme ?? "All programmes", o.level, `${o.semester} ${o.academicYear}`].filter(Boolean).join(" · ");

/** The account's phone number when it signed in by text (its placeholder email carries the digits). */
const phoneFromAccount = (email: string | null | undefined) =>
  isPhoneEmail(email) ? `+${email!.split("@")[0]}` : null;

/**
 * Details, once, after the first sign-in: who you are on the register, how
 * your group can reach you, and your class. Arriving from an invite link,
 * the class is the group's and you join it straight after.
 */
function Onboarding() {
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [offerings, setOfferings] = useState<CourseOffering[] | null>(null);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [fullName, setFullName] = useState("");
  const [indexNumber, setIndexNumber] = useState("");
  const [programme, setProgramme] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [offeringId, setOfferingId] = useState("");
  const [identityLocked, setIdentityLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const verifiedPhone = phoneFromAccount(user?.primaryEmail);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const code = pendingInvite();
    if (code) {
      previewInvite({ data: { code } }).then(
        (inv) => {
          setInvite(inv);
          setOfferingId(inv.offeringId);
        },
        () => forgetInvite(),
      );
    }
    void listOfferings().then((rows) => {
      setOfferings(rows);
      setOfferingId((current) => current || rows[0]?.id || "");
    });
    void getWorkspace().then(({ student }) => {
      if (!student) return;
      setFullName(student.fullName);
      setIndexNumber(student.indexNumber);
      setProgramme(student.programme);
      setIdentityLocked(true);
    });
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    if (!isPhoneEmail(user.primaryEmail) && user.primaryEmail) setEmail((v) => v || user.primaryEmail!);
    if (user.displayName && user.displayName !== "New student") setFullName((v) => v || user.displayName!);
  }, [user]);

  if (isPending) return <div className="min-h-dvh bg-bg" />;
  if (!user) return <RedirectToSignIn />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertProfile({
        data: { fullName, indexNumber, programme, email, phone: verifiedPhone ?? phone, offeringId },
      });
      if (invite) {
        await joinGroup({ data: { joinCode: invite.code } });
        forgetInvite();
      }
      await navigate({ to: "/studio" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh text-ink">
      <div className="mx-auto max-w-md px-5 py-10">
        <LogoMark full />
        <h1 className="mt-5 font-display text-4xl font-extrabold">Your details</h1>
        <p className="mt-2 text-[15px] leading-6 text-muted">
          {invite
            ? `Once these are in, you join ${invite.groupName}.`
            : "As they appear on the class register. You only fill this in once."}
        </p>
        {!offerings ? (
          <Loading />
        ) : (
          <Card className="mt-6">
            <form className="space-y-4" onSubmit={(e) => void submit(e)}>
              <Field label="Full name" hint={identityLocked ? "Already on record, so it can’t be changed here." : undefined}>
                <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={identityLocked} autoComplete="name" />
              </Field>
              <Field label="Index number" hint={identityLocked ? "Already on record." : "Each index number can only be in one group."}>
                <Input
                  required
                  value={indexNumber}
                  onChange={(e) => setIndexNumber(e.target.value)}
                  placeholder="e.g. PS/BMS/22/0001"
                  disabled={identityLocked}
                  autoComplete="off"
                />
              </Field>
              <Field label="Programme">
                <Input required value={programme} onChange={(e) => setProgramme(e.target.value)} placeholder="e.g. BSc Business Administration" />
              </Field>
              <Field label="Email">
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </Field>
              {verifiedPhone ? (
                <Field label="Phone number" hint="Checked by text message when you signed in.">
                  <Input value={formatPhone(verifiedPhone)} disabled />
                </Field>
              ) : (
                <Field label="Phone number" hint="So your group can reach you on WhatsApp.">
                  <Input type="tel" inputMode="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 412 3456" autoComplete="tel" />
                </Field>
              )}
              {invite ? (
                <Field label="Class">
                  <Input value={invite.classLabel} disabled />
                </Field>
              ) : (
                <Field label="Your class">
                  <Select required value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
                    {offerings.map((o) => (
                      <option key={o.id} value={o.id}>
                        {classLabel(o)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <FormMessages error={error} />
              <Button type="submit" size="lg" className="w-full" disabled={saving || !offeringId}>
                {saving ? "Saving…" : invite ? `Save and join ${invite.groupName}` : "Save"}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </main>
  );
}
