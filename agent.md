# Agent Instructions

Before starting routine work in this project, read `doc/AGENT_FAST_CONTEXT.md` first. Read `doc/PROJECT_WORKSPACE_GUIDE.md` when you need full directory ownership rules, broad project context, or when changing Notion fields/schema.

Treat `program` as the active Python CLI and skill development area. Treat `references` as read-only reference material unless the user explicitly asks to work on the Edge extension or historical trigger route. Keep local credentials, especially `program/config.json`, out of commits.

Prefer targeted reads over whole-file reads for large frontend files. For `program/web/materials.js` and `program/web/styles.css`, search for the relevant function or selector first and read only nearby context unless a broader refactor requires more.
