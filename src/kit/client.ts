import Anthropic from "@anthropic-ai/sdk";
import type { KitClient } from "@/kit/chat";

// The real client once an API key is configured. Kept apart from the route so a test can swap it,
// and because a route file may only export its HTTP handlers.
export const dependencies: { client: () => KitClient | null } = {
  client: () => (process.env.ANTHROPIC_API_KEY ? (new Anthropic() as unknown as KitClient) : null),
};
