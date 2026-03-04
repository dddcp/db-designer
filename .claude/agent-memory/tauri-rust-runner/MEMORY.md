# Project: db-designer — Agent Memory

## Project Overview
- Tauri v2 desktop app, React + TypeScript frontend, Rust backend
- Package manager: yarn
- Frontend: React 18, antd 5, react-router-dom v7, @dnd-kit drag-and-drop
- Backend crates: tauri 2, rusqlite 0.31 (bundled), serde, serde_json, dotenv

## Key Paths
- Project root: D:\workspace\react\db-designer
- Rust source: D:\workspace\react\db-designer\src-tauri\src
- Frontend source: D:\workspace\react\db-designer\src
- tsconfig: D:\workspace\react\db-designer\tsconfig.json (strict mode, noUnusedLocals, noUnusedParameters)

## Build Commands
- Frontend TS check: `cd D:/workspace/react/db-designer && npx tsc --noEmit`
- Rust check: `cd D:/workspace/react/db-designer/src-tauri && cargo check`
- Rust build: `cd D:/workspace/react/db-designer/src-tauri && cargo build`
- First-time cargo check takes ~60s (rusqlite bundled build)
- Incremental `cargo build` (dev) takes ~40s when only top-level crate changed
- Additional deps: mysql 25, postgres 0.19, native-tls 0.2, postgres-native-tls 0.5

## Known Issues & Fixes
- 2026-03-04: `src/components/proj-detail/index.tsx` had JSX with multiple root nodes in `return()`:
  `<Layout>...</Layout>` followed by `<Modal>...</Modal>` without a Fragment wrapper.
  Fix: wrap the entire return body in `<>...</>` (React Fragment).
  Error messages were: TS1005 ')' expected, TS1128 Declaration or statement expected.
- 2026-03-04: `src/components/proj-detail/init-data-tab.tsx` had three TS6133 "declared but never read" errors:
  (1) `useRef` imported but unused — removed from React import line.
  (2) `columnNames` / `columnDisplayNames` declared inside `handleImportExcel` but unused — removed both lines;
      the Excel mapping already accesses `col.name` / `col.displayName` directly via `selectedTable!.columns.forEach`.
