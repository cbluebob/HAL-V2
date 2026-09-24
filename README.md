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
