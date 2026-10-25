"use client";

import { useState } from "react";

import { ConnectApiKeyDialog } from "@/components/account/agents/connect-api-key-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAgentConnections,
  useConnectAgent,
  useConnectClaudeApiKey,
  useConnectCursorApiKey,
  useDisconnectAgent,
} from "@/hooks/ai/use-agent-connections";
import { PROVIDER_LABEL } from "@/mocks/data/agent-delegation";
import {
  EAgentConnectionStatus,
  EAgentProvider,
} from "@/types/ai/agent-delegation";

/** Providers that connect with a BYO API key vs an OAuth redirect. */
const API_KEY_PROVIDERS = [EAgentProvider.Cursor, EAgentProvider.ClaudeCode] as const;
const OAUTH_PROVIDERS = [EAgentProvider.Codex] as const;
const ORDER = [EAgentProvider.Cursor, EAgentProvider.ClaudeCode, EAgentProvider.Codex] as const;

const isApiKeyProvider = (p: EAgentProvider): p is (typeof API_KEY_PROVIDERS)[number] =>
  (API_KEY_PROVIDERS as readonly EAgentProvider[]).includes(p);

const API_KEY_HINT: Record<(typeof API_KEY_PROVIDERS)[number], string> = {
  [EAgentProvider.Cursor]: "Paste an API key from Cursor Dashboard",
  [EAgentProvider.ClaudeCode]: "Paste an Anthropic API key from the Console",
};

const API_KEY_DIALOG: Record<
  (typeof API_KEY_PROVIDERS)[number],
  { title: string; placeholder: string; keyHelp: React.ReactNode }
> = {
  [EAgentProvider.Cursor]: {
    title: "Connect Cursor",
    placeholder: "Paste your Cursor API key",
    keyHelp: (
      <>
        Cursor uses a personal API key — not OAuth. Create one under{" "}
        <a
          href="https://cursor.com/dashboard?tab=integrations"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Cursor Dashboard → Integrations → API Keys
        </a>
        .
      </>
    ),
  },
  [EAgentProvider.ClaudeCode]: {
    title: "Connect Claude",
    placeholder: "Paste your Anthropic API key (sk-ant-…)",
    keyHelp: (
      <>
        Claude connects with a personal Anthropic API key. Create one under{" "}
        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Anthropic Console → API Keys
        </a>
        . Delegated runs are billed to your Anthropic account.
      </>
    ),
  },
};

export function ConnectedAgentsPanel() {
  const { data, isPending, isSuccess } = useAgentConnections();
  const connectOAuth = useConnectAgent();
  const disconnect = useDisconnectAgent();
  const connectCursor = useConnectCursorApiKey();
  const connectClaude = useConnectClaudeApiKey();
  const [apiKeyProvider, setApiKeyProvider] = useState<
    (typeof API_KEY_PROVIDERS)[number] | null
  >(null);

  const byProvider = new Map((data ?? []).map((c) => [c.provider, c]));

  const connect = (provider: EAgentProvider) => {
    if (isApiKeyProvider(provider)) {
      setApiKeyProvider(provider);
      return;
    }
    connectOAuth.mutate(provider);
  };

  // Both key mutations are held at the top level (hooks can't be conditional);
  // the open dialog uses whichever matches the provider being connected.
  const activeMutation =
    apiKeyProvider === EAgentProvider.ClaudeCode ? connectClaude : connectCursor;
  const activeConfig = API_KEY_DIALOG[apiKeyProvider ?? EAgentProvider.Cursor];

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Coding agents</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Connect your own agent accounts. Delegated work runs on your account and tokens — not
        GigsNano&apos;s.
      </p>

      <ConnectApiKeyDialog
        open={apiKeyProvider !== null}
        onOpenChange={(open) => !open && setApiKeyProvider(null)}
        title={activeConfig.title}
        placeholder={activeConfig.placeholder}
        keyHelp={activeConfig.keyHelp}
        mutation={activeMutation}
      />

      {isPending ? (
        <div className="mt-6 space-y-2">
          {ORDER.map((p) => (
            <Skeleton key={p} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ul
          className={
            isSuccess
              ? "t-delegation-list mt-6 divide-y rounded-lg border"
              : "mt-6 divide-y rounded-lg border"
          }
        >
          {ORDER.map((provider, i) => {
            const conn = byProvider.get(provider);
            const connected = conn?.status === EAgentConnectionStatus.Connected;
            const oauthPending =
              connectOAuth.isPending && connectOAuth.variables === provider;
            const idle = isApiKeyProvider(provider)
              ? API_KEY_HINT[provider]
              : "Sign in with OAuth";
            return (
              <li
                key={provider}
                className="t-stagger-line flex items-center justify-between gap-4 px-4 py-3"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div>
                  <p className="text-sm font-medium">{PROVIDER_LABEL[provider]}</p>
                  <p className="text-xs text-muted-foreground">
                    {connected && conn
                      ? conn.account_label
                      : conn
                        ? "Connection expired — reconnect to use it."
                        : idle}
                  </p>
                </div>
                {connected && conn ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="transition-transform duration-150 ease-out active:scale-[0.97]"
                    disabled={disconnect.isPending}
                    onClick={() => disconnect.mutate(conn.id)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="transition-transform duration-150 ease-out active:scale-[0.97]"
                    disabled={oauthPending}
                    onClick={() => connect(provider)}
                  >
                    {oauthPending ? "Redirecting…" : conn ? "Reconnect" : "Connect"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
