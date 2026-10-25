import {
  ECapabilityAccess,
  ECapabilityRisk,
  EConnectorAuthMethod,
  EConnectorCategory,
  EDataClass,
  type IConnectorManifest,
} from "@/types/solution/connector";

function retention(notes: string) {
  return {
    retain_days_after_disconnect: 30,
    delete_on_disconnect: true,
    notes,
  };
}

/** GIN-455 fixtures: GitHub, Figma, Slack/Teams, docs, mailbox, ERP file import. */
export const githubConnector: IConnectorManifest = {
  key: "github",
  version: 1,
  name: "GitHub",
  provider: "github",
  category: EConnectorCategory.SourceControl,
  auth_methods: [EConnectorAuthMethod.OAuthApp, EConnectorAuthMethod.OAuthUser],
  admin_prerequisites: ["Organization must approve the GigsNano GitHub App."],
  capabilities: [
    {
      key: "repos.read",
      label: "Read repositories",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.Medium,
      provider_scopes: ["repo:status", "metadata:read"],
      data_classes: [EDataClass.Internal],
    },
    {
      key: "repos.write",
      label: "Write repositories",
      access: ECapabilityAccess.Write,
      risk: ECapabilityRisk.High,
      provider_scopes: ["contents:write"],
      data_classes: [EDataClass.Internal],
    },
  ],
  source_selectors: [
    {
      key: "repository",
      label: "Repository",
      kind: "repo",
      scoping_levels: ["organization", "repository"],
    },
  ],
  supports_health_check: true,
  supports_webhooks: true,
  supports_delta_sync: true,
  rate_limits: { requests_per_minute: 60, burst: 10 },
  retention: retention("Cloned workspaces are deleted on disconnect."),
  docs_url: "https://docs.gigsnano.com/connectors/github",
  min_app_version: null,
};

export const figmaConnector: IConnectorManifest = {
  key: "figma",
  version: 1,
  name: "Figma",
  provider: "figma",
  category: EConnectorCategory.Design,
  auth_methods: [EConnectorAuthMethod.OAuthUser],
  admin_prerequisites: [],
  capabilities: [
    {
      key: "files.read",
      label: "Read design files",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.Low,
      provider_scopes: ["file_content:read"],
      data_classes: [EDataClass.Internal],
    },
  ],
  source_selectors: [
    { key: "file", label: "File", kind: "file", scoping_levels: ["team", "file"] },
  ],
  supports_health_check: true,
  supports_webhooks: false,
  supports_delta_sync: false,
  rate_limits: { requests_per_minute: 30, burst: 5 },
  retention: retention("Cached previews expire in 30 days."),
  docs_url: null,
  min_app_version: null,
};

export const slackTeamsConnector: IConnectorManifest = {
  key: "slack_teams",
  version: 1,
  name: "Slack / Teams",
  provider: "slack_teams",
  category: EConnectorCategory.Chat,
  auth_methods: [EConnectorAuthMethod.OAuthApp],
  admin_prerequisites: ["Workspace admin must install the bot."],
  capabilities: [
    {
      key: "channels.read",
      label: "Read channel metadata",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.Medium,
      provider_scopes: ["channels:read"],
      data_classes: [EDataClass.Internal],
    },
    {
      key: "messages.write",
      label: "Post messages",
      access: ECapabilityAccess.Write,
      risk: ECapabilityRisk.Medium,
      provider_scopes: ["chat:write"],
      data_classes: [EDataClass.Internal],
    },
  ],
  source_selectors: [
    {
      key: "channel",
      label: "Channel",
      kind: "channel",
      scoping_levels: ["workspace", "channel"],
    },
  ],
  supports_health_check: true,
  supports_webhooks: true,
  supports_delta_sync: false,
  rate_limits: { requests_per_minute: 50, burst: 8 },
  retention: retention("Message mirrors are not stored after disconnect."),
  docs_url: null,
  min_app_version: null,
};

export const documentStoreConnector: IConnectorManifest = {
  key: "document_store",
  version: 1,
  name: "Document store",
  provider: "generic_docs",
  category: EConnectorCategory.Documents,
  auth_methods: [EConnectorAuthMethod.OAuthUser, EConnectorAuthMethod.ApiKey],
  admin_prerequisites: [],
  capabilities: [
    {
      key: "files.read",
      label: "Read files",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.Medium,
      provider_scopes: ["files.readonly"],
      data_classes: [EDataClass.Confidential],
    },
  ],
  source_selectors: [
    { key: "folder", label: "Folder", kind: "folder", scoping_levels: ["drive", "folder"] },
  ],
  supports_health_check: true,
  supports_webhooks: false,
  supports_delta_sync: true,
  rate_limits: { requests_per_minute: 40, burst: 5 },
  retention: retention("Indexed chunks are purged on disconnect."),
  docs_url: null,
  min_app_version: null,
};

export const sharedMailboxConnector: IConnectorManifest = {
  key: "shared_mailbox",
  version: 1,
  name: "Shared mailbox",
  provider: "microsoft_graph",
  category: EConnectorCategory.Mail,
  auth_methods: [EConnectorAuthMethod.OAuthApp],
  admin_prerequisites: ["Exchange admin must grant shared-mailbox access."],
  capabilities: [
    {
      key: "mail.read",
      label: "Read shared mailbox",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.High,
      provider_scopes: ["Mail.Read"],
      data_classes: [EDataClass.Confidential, EDataClass.Restricted],
    },
  ],
  source_selectors: [
    {
      key: "mailbox",
      label: "Mailbox",
      kind: "mailbox",
      scoping_levels: ["tenant", "mailbox", "folder"],
    },
  ],
  supports_health_check: true,
  supports_webhooks: true,
  supports_delta_sync: true,
  rate_limits: { requests_per_minute: 20, burst: 4 },
  retention: retention("Message bodies are not retained after disconnect."),
  docs_url: null,
  min_app_version: null,
};

export const erpFileImportConnector: IConnectorManifest = {
  key: "erp_file_import",
  version: 1,
  name: "File-based ERP import",
  provider: "file_upload",
  category: EConnectorCategory.ErpImport,
  auth_methods: [EConnectorAuthMethod.FileUpload],
  admin_prerequisites: [],
  capabilities: [
    {
      key: "files.read",
      label: "Read uploaded extracts",
      access: ECapabilityAccess.Read,
      risk: ECapabilityRisk.Medium,
      provider_scopes: [],
      data_classes: [EDataClass.Confidential],
    },
  ],
  source_selectors: [
    { key: "upload", label: "Upload", kind: "file", scoping_levels: ["upload"] },
  ],
  supports_health_check: false,
  supports_webhooks: false,
  supports_delta_sync: false,
  rate_limits: { requests_per_minute: null, burst: null },
  retention: retention("Uploads are deleted after successful ingest or 7 days."),
  docs_url: null,
  min_app_version: null,
};

export const CONNECTOR_FIXTURES: IConnectorManifest[] = [
  githubConnector,
  figmaConnector,
  slackTeamsConnector,
  documentStoreConnector,
  sharedMailboxConnector,
  erpFileImportConnector,
];

export function findConnector(
  catalogue: IConnectorManifest[],
  key: string,
): IConnectorManifest | null {
  return catalogue.find((c) => c.key === key) ?? null;
}
