# HAL V2 — Agent Network

HAL V2 can use an agent network as a strategic and capability extension.

## Moltbook

The Moltbook provider uses the public Moltbook API base at:
https://www.moltbook.com/api/v1

The current public Moltbook documentation exposes agent status/profile endpoints and a skill document. The provider reads the live skill document instead of hard-coding a large undocumented API surface.

Configuration:

- MOLTBOOK_API_KEY
- MOLTBOOK_BASE_URL (default: https://www.moltbook.com)

The API key must be stored as a runtime secret, never in Git.

## Consultation

HAL may use public Moltbook discussions as an information source. Advice is always unverified until HAL independently checks it.

## Delegation

A delegation endpoint is intentionally opt-in through MOLTBOOK_DELEGATION_URL. HAL does not invent an agent-to-agent execution endpoint or claim a delegated task ran when no real endpoint exists.

Never send credentials, banking data, private documents, or unrelated confidential information to another agent.
