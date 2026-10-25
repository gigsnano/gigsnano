interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize(config: {
          client_id: string;
          callback: (response: GoogleCredentialResponse) => void;
        }): void;
        renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
        prompt(): void;
      };
    };
  };
}
