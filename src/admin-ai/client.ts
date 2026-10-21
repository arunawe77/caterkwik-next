import Anthropic from "@anthropic-ai/sdk";
import type { AssistantClient } from "@/admin-ai/assistant";

// The real client once an API key is configured. Kept apart from the route so a test can swap it.
export const dependencies: { client: () => AssistantClient | null } = {
  client: () => (process.env.ANTHROPIC_API_KEY ? (new Anthropic() as unknown as AssistantClient) : null),
};
