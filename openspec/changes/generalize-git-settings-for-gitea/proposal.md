## Why

The current Git settings model only supports a small set of hosted platforms and hardcodes public remote URL patterns, which prevents users from configuring self-hosted Gitea and other non-standard Git remotes. This change is needed now because Git synchronization is already a visible product feature, and the current model blocks private deployment scenarios while making future Git platform support increasingly brittle.

## What Changes

- Generalize Git settings from a platform-driven model (`platform + token + repository`) to a remote-and-auth model that supports preset platforms and custom remote URLs.
- Add first-class support for self-hosted Gitea by allowing users to configure a service base URL in preset mode.
- Support both HTTPS token authentication and SSH-based authentication in Git settings.
- Update Git initialization and sync flows to resolve remotes from the new configuration model instead of hardcoded platform-specific URL construction.
- Preserve compatibility for existing GitHub, GitLab, and Gitee users by mapping legacy stored settings into the new configuration model.
- Update UI validation and Git availability checks so the app correctly recognizes valid Git configurations beyond the legacy token/repository fields.

## Capabilities

### New Capabilities
- `git-remote-configuration`: Configure Git remotes using either preset platform fields or a custom remote URL, including support for self-hosted Gitea.
- `git-authentication-modes`: Configure Git synchronization to use HTTPS token authentication or SSH authentication.

### Modified Capabilities
- `local-app-settings`: Extend local app settings requirements to persist the expanded Git configuration fields and preserve compatibility with legacy Git settings.

## Impact

- Frontend settings UI in `src/components/setting/git-tab.tsx`
- Frontend Git-related types in `src/types/index.ts`
- Main page Git configuration status checks in `src/components/main/main.tsx`
- Backend local settings handling in `src-tauri/src/services/setting_service.rs`
- Backend Git command handling and remote resolution in `src-tauri/src/git.rs`
- Existing local Git configuration data stored in app settings
