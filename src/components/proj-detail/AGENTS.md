# Project Detail Workspace (proj-detail/)

## OVERVIEW

Core design workspace — the largest and most complex frontend module. 15 files covering table structure editing, AI design, DB sync, version management, SQL export, and routine management. Central component `index.tsx` weighs ~1300 lines.

## WHERE TO LOOK

| Task | File | Notes |
|------|------|-------|
| Add a new tab panel | `<name>-tab.tsx` | Import into `index.tsx`, add to `<Tabs>` component |
| Add an AI modal | `ai-<name>-modal.tsx` | Import into `index.tsx`, add state + trigger |
| Change table editing UI | `index.tsx` | Left sidebar + main work area |
| Change column drag-drop | `index.tsx` | Uses `@dnd-kit` (`SortableContext` + `useSortable`) |
| Change index editing | `index-tab.tsx` | Index management tab |
| Change init data | `init-data-tab.tsx` | Excel import + INSERT export |
| Change SQL export | `sql-export-tab.tsx` + `database-code-tab.tsx` | Export triggers, uses `dialect.rs` via IPC |
| Change version mgmt | `version-tab.tsx` | Snapshots, diff, SQL export |
| Change DB sync | `sync-tab.tsx` + `sync-table-diff.tsx` + `sync-routine-diff.tsx` | Connect/compare/sync remote DB |
| Change routine mgmt | `routine-tab.tsx` | Functions, procedures, triggers CRUD |
| Change AI table design | `ai-design-modal.tsx` | Natural language → table structure |
| Change AI table modify | `ai-modify-table-modal.tsx` | Natural language → table refactor |
| Change AI index suggest | `ai-recommend-index-modal.tsx` | AI index analysis |
| Change AI review | `ai-review-tab.tsx` | AI review issues + suggestions |
| Change AI SQL chat | `ai-sql-tab.tsx` | AI-powered SQL generation |

## CONVENTIONS

- **Tab-based layout** — each feature is a separate `*-tab.tsx` file imported by `index.tsx`
- **Ant Design only** — no custom CSS framework, use `Table`, `Form`, `Modal`, `Tabs`, `Button` etc.
- **Component-level state** — no global state manager; all state via `useState` in `index.tsx` and passed as props
- **IPC calls** — `invoke<ReturnType>('command_name', { camelCaseParams })`
- **Debug logging** — `console.log`/`console.error` for errors (lines 557-559 have debug logs to remove)
- **i18n** — use `useTranslation()` hook from `react-i18next` for all user-visible strings

## ANTI-PATTERNS

- **NEVER** add Redux/Zustand/Context for local state — keep component-level
- **NEVER** hardcode column types — use `BUILT_IN_DATA_TYPES` from `data-types.ts`
- **NEVER** put SQL generation logic in frontend — call Tauri commands that use `dialect.rs`
- **NEVER** import from other page components — `main/` and `setting/` are separate routes

## KEY FILES

| File | Lines | Role |
|------|-------|------|
| `index.tsx` | ~1300 | Main workspace: sidebar + tabs, holds all page state |
| `ai-design-modal.tsx` | 497 | AI natural language table design |
| `ai-sql-tab.tsx` | 525 | AI SQL generation chat |
| `init-data-tab.tsx` | 536 | Table initial data (Excel import / INSERT export) |
| `sync-table-diff.tsx` | 474 | Remote table comparison diff view |
| `routine-tab.tsx` | 399 | Programmable objects CRUD + sync |
| `version-tab.tsx` | 385 | Version snapshot management + SQL export |

## NOTES

- `index.tsx` is a monolith (~1300 lines) — consider splitting into smaller sub-components if adding new features
- Props are passed down from `index.tsx` to all tab components; no Context/Store pattern
- Column drag-drop relies on `@dnd-kit` library's `SortableContext`
- `data-types.ts` is imported from `src/` root, not from `types/`