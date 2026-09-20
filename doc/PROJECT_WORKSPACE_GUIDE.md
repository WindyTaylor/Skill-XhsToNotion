# Project Workspace Guide

Updated: 2026-08-05

This file is the full workspace guide for ownership and write-boundary rules. For routine tasks, read `doc/AGENT_FAST_CONTEXT.md` first; read this guide when you need full directory context, are unsure about write boundaries, or are changing Notion fields/schema.

## Directory Overview

| Directory | Observed Contents | Purpose | Read/Write Rules |
| --- | --- | --- | --- |
| `program` | Python CLI, local extractor, Notion configuration helpers, skill files, album map runtime data | Main development area for the Python CLI route and the active skill | Writable for implementation tasks. Keep `program/config.json` local and private. |
| `references` | `4.edge_with_notion` Edge extension and historical `trigger.js` OpenClaw integration | Reference implementations for browser-based scraping and older trigger ideas | Read-only by default. Edit only when the task explicitly targets browser extension/reference behavior. |
| `doc` | Setup/config history, project status, this guide, project summary | Documentation and project memory | Writable for documentation updates and project notes. |
| `.trae` | Legacy Trae skill mirror | Tool-specific historical reference | Conditional. Do not edit unless the task explicitly targets Trae integration. |
| `__pycache__` | Python bytecode cache | Generated runtime output | Ignore. Do not edit manually. |
| `.git` | Git repository internals | Version control metadata | Do not edit manually. Use Git commands only. |

## Pre-Task Rules

1. Read `doc/AGENT_FAST_CONTEXT.md` first for routine tasks; read this guide when full workspace rules are needed.
2. Treat `program` as the current source of truth for the Python CLI and skill route.
3. Treat `references` as read-only reference material unless the user explicitly asks to work on the Edge extension or historical trigger route.
4. Keep local credentials out of commits. `program/config.json` is private runtime configuration; use `program/config_template.json` for examples.
5. When changing Notion fields, update `program/README.md`, `program/SKILL.md`, and any affected docs together.
6. Do not enter `.git`, `__pycache__`, or generated output folders for ordinary feature work.
7. When implementing the Notion embedded search/management console, read `program/README.md` and nearby `program/web/` code first. For the photography materials page, also read `doc/MATERIALS_PAGE_DESIGN_README.md`.

## Naming Notes

- User shorthand “参考文件” maps to the actual top-level directory `references`.
- User shorthand “Python CLI 路线和 skill” maps to the actual top-level directory `program`.
- User shorthand “doc 文件夹” maps to the actual top-level directory `doc`.
- `references/4.edge_with_notion` is preserved as a browser extension reference and uses a different Notion schema from the Python CLI route.
