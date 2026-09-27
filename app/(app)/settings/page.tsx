import { getSettings, requireUser } from "@/lib/auth";
import { SettingsForm } from "@/components/AdminForms";
import { PageHead } from "@/components/ui";

export default async function SettingsPage() {
  await requireUser("admin");
  return (
    <>
      <PageHead title="Settings" />
      <SettingsForm v={await getSettings()} />
    </>
  );
}
