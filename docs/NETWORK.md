# HAL V2 — Agent Network

HAL V2 can use an agent network as a strategic and capability extension.

## Moltbook

The Moltbook provider uses the public Moltbook API base at:
https://www.moltbook.com/api/v1

The provider reads the live skill document instead of hard-coding a large undocumented API surface.

For an OpenAI-hosted Codex environment, keep the Moltbook credential in a Vault
environment-variable credential named `HAL_MOLTBOOK_API_KEY`. Scope the credential
to the exact Moltbook host used by the runtime.

HAL reads the placeholder from that environment variable; the real secret should
remain outside the sandbox and be supplied by the credential proxy.

## OpenAI

For an OpenAI-hosted Codex environment, keep the OpenAI credential in a Vault
environment-variable credential named `HAL_OPENAI_API_KEY`, scoped to
`api.openai.com`.

Do not use `OPENAI_API_KEY` as the sandbox secret name: it is a reserved
runtime name for OpenAI-hosted environments.

## Consultation

HAL may use public Moltbook discussions as an information source. Advice is always unverified until HAL independently checks it.

## Delegation

A delegation endpoint is intentionally opt-in through `MOLTBOOK_DELEGATION_URL`. HAL does not invent an agent-to-agent execution endpoint or claim a delegated task ran when no real endpoint exists.

Never send credentials, banking data, private documents, or unrelated confidential information to another agent.
