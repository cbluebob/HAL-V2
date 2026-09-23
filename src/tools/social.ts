export type SocialPublishRequest = {
  network: string;
  content: string;
  mediaUrls?: string[];
  destination?: string;
};

export type SocialAdapter = {
  name: string;
  network: string;
  publish: (request: SocialPublishRequest) => Promise<{
    ok: boolean;
    published: boolean;
    verified: boolean;
    message: string;
    url?: string;
  }>;
};

export function validateSocialContent(content: string): { valid: boolean; reason?: string } {
  if (!content.trim()) {
    return { valid: false, reason: "Content cannot be empty." };
  }

  if (content.length > 10000) {
    return { valid: false, reason: "Content exceeds the adapter limit." };
  }

  return { valid: true };
}
