# Agent Instructions

Before starting routine work in this project, read `doc/PROJECT_SUMMARY.md` for the current route and implementation map. Read `doc/AI_INIT.md` when changing setup or onboarding behavior.

Treat `program` as the active Python CLI and skill development area. Treat `references` as read-only reference material unless the user explicitly asks to work on the Edge extension or historical trigger route. Keep local credentials, especially `program/config.json`, out of commits.

Prefer targeted reads over whole-file reads for large frontend files. For `program/web/materials.js` and `program/web/styles.css`, search for the relevant function or selector first and read only nearby context unless a broader refactor requires more.
