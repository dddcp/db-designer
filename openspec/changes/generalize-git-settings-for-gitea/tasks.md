## 1. Git configuration model

- [x] 1.1 Update frontend Git type definitions in `src/types/index.ts` for remote mode, platform, auth type, remote config, and auth config
- [x] 1.2 Extend local settings allowlist in `src-tauri/src/services/setting_service.rs` to persist the expanded Git configuration fields
- [x] 1.3 Add backend Git config parsing and validation logic in `src-tauri/src/git.rs` with fallback support for legacy stored Git fields

## 2. Git settings user interface

- [x] 2.1 Refactor `src/components/setting/git-tab.tsx` to present preset/custom remote modes and token/SSH authentication modes
- [x] 2.2 Implement conditional field rendering and validation for Gitea base URL, custom remote URL, and token credentials in the settings form
- [x] 2.3 Update Git settings load/save behavior to read and write the new field set while preserving legacy compatibility

## 3. Git command flow updates

- [x] 3.1 Refactor `init_git_repository` in `src-tauri/src/git.rs` to resolve remotes from normalized Git config instead of hardcoded platform URL branches
- [x] 3.2 Refactor `sync_git_repository` in `src-tauri/src/git.rs` to verify or refresh `origin` from the saved Git config before pushing
- [x] 3.3 Keep provider-specific HTTPS token formatting isolated to the final remote execution step

## 4. App integration and verification

- [x] 4.1 Update Git configuration completeness checks in `src/components/main/main.tsx` for preset/custom and token/SSH configurations
- [ ] 4.2 Verify legacy GitHub, GitLab, and Gitee settings still initialize and sync without manual re-entry
- [ ] 4.3 Verify self-hosted Gitea preset mode and custom SSH remote mode both save, initialize, and sync correctly
