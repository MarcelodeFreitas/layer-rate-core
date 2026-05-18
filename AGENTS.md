# Agent Instructions

## Project

LayerRate Core is the open-source pricing engine for 3D printing quotes.

The goal is to keep all pricing math reusable, transparent, tested, and independent from any UI, database, API, or hosted service.

Use `LayerRate Core` for human-facing text and `layer-rate-core` for the repository, folder, and package slug.

## Scope

- Keep this package focused on pricing logic only.
- Do not add React, Next.js, database code, authentication, payments, or hosted-service features.
- The first pricing surface should include every field needed for practical 3D print quote calculations.
- Preserve a detailed cost breakdown, not only the final price.
- Keep the core API one-shot: it should receive every value needed for a quote in a single complete input object.
- Do not model saved printers, materials, labor defaults, or user profiles in this package. Those belong in apps and tools built on top of the core.

## Tech Stack

- TypeScript
- Vitest for tests
- No runtime dependencies unless they clearly improve correctness or validation

## Pricing Design

LayerRate should price from slicer/user-provided data first.

The first version assumes the user provides:
- print weight
- print time
- material cost
- printer price, power, lifetime, usage, and repair ratio
- labor rate and labor times
- failure ratio
- component cost
- markup
- quantity

Future apps and tools around the core can add:
- printer presets
- filament presets
- farm profiles
- G-code or 3MF import
- OrcaSlicer post-processing scripts
- MCP/API wrappers

## Engineering Rules

- All formulas must be explicit and covered by tests.
- Prefer clear variable names over clever abstractions.
- Keep monetary calculations deterministic and easy to audit.
- Do not hide business assumptions inside UI-only code.
- If a formula is uncertain, document the assumption in code or tests.
