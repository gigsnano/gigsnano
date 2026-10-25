import { VoiceSettings } from "@/components/settings/voice-settings";

export default async function VoiceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  await params;
  return <VoiceSettingsContainer />;
}

// ponytail: the container is a thin client island rather than a data hook —
// GET/PATCH for the voice policy is not on the API yet (GIN-517 shipped the
// resolver, not the endpoint). Defaults mirror PLATFORM_DEFAULTS, so the screen
// is honest about what voice does today: off, confirmation forced, audio never
// stored. Pass onPublish/onRollback from a client parent when the route lands —
// a server component cannot hand a function to a client component.
//
// The provider fields are set here, not edited on screen: the API reads region
// and deployment from server env (AZURE_SPEECH_REGION, AZURE_OPENAI_RT_DEPLOYMENT),
// so these mirror those defaults and keep validatePolicy satisfied.
function VoiceSettingsContainer() {
  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Voice</h1>
        <p className="text-sm text-muted-foreground">
          Let people talk to GigsAI to read and draft work items. Off until you turn it on.
        </p>
      </header>
      <VoiceSettings
        initial={{
          enabled: false,
          region: "uae-north",
          deployment: "rt-mini",
          locales: ["en-AE"],
          requireConfirmation: true,
          retainRawAudio: false,
          transcriptRetentionDays: 30,
          monthlyMinutesQuota: 600,
          secretRef: "",
        }}
        publishedVersion={1}
      />
    </div>
  );
}
