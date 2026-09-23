export type WebResource = {
  id: string;
  label: string;
  kind: "website" | "marketplace" | "social";
  enabled: boolean;
};

export type WebBrowserAdapter = {
  name: string;
  canAccess: (resource: WebResource) => boolean;
  navigate: (url: string) => Promise<{
    ok: boolean;
    url: string;
    message: string;
    verified: boolean;
    data?: unknown;
  }>;
};

export function isConnectedResource(resource: WebResource): boolean {
  return resource.enabled;
}
