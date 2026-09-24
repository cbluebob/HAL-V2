# HAL V2

HAL V2 is an action-oriented personal agent.

## Core principles
- Observer -> Understand -> Research -> Verify -> Decide -> Act -> Control -> Report
- ZERO CREDIT / ZERO DEBT is absolute.
- Never claim an action occurred without a verifiable execution result.
- No fabricated missions, metrics, confidence scores, transactions, or journal events.
- Sensitive, irreversible, financial, legal, or external actions require explicit authorization unless a future policy explicitly pre-authorizes them.

## Architecture
- Core: mission lifecycle and orchestration
- Guard: permissions and safety policy
- Memory: real event journal
- Modules: Money, Secretary, Business, Hexagon, TikTok, Network

This repository contains the executable foundation, not a simulated cockpit.

## Cost control

HAL applies a local AI budget guard before autonomous resources that declare an AI-call estimate.

Default mission budget:
- maximum 6 AI calls
- maximum 20,000 estimated tokens
- maximum $0.25 estimated model cost

AI resources must declare their expected model, input tokens, and output tokens through `aiEstimate`. When the budget is exhausted, HAL blocks the AI resource instead of continuing to spend.

This is an application-level preflight guard, not a replacement for the OpenAI project spend controls. OpenAI project spend controls should remain configured separately as the billing backstop.

## Model routing

HAL uses deterministic task routing to control cost:
- Routine tasks -> GPT-5.6 Luna
- Reasoning/research tasks -> GPT-5.6 Sol
- Complex tasks -> GPT-5.6 Sol by default
- GPT-5.6 Terra is available as an explicit model option

Model selection is based on the task text and does not require an additional classification model call.

## OpenAI Hosted Agents

HAL includes a hosted Agents Sessions adapter that can create a managed OpenAI environment, attach the HAL Vault, submit initial input, and consume the first-turn SSE stream.

The adapter expects `HAL_AGENTS_API_KEY` (or `OPENAI_API_KEY`) outside the hosted sandbox. The hosted environment receives Vault credentials through the Agents API; HAL never stores or prints the underlying credential value.
