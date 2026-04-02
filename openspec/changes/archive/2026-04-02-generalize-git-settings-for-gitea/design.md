## Context

The current Git integration stores a small fixed set of Git fields in local settings and derives the remote URL directly inside `src-tauri/src/git.rs`. That works for a few public providers, but it couples platform choice, remote URL construction, and authentication formatting into a single branch table. As a result, self-hosted Gitea and other non-default remotes cannot be represented without adding more hardcoded cases.

This change crosses frontend form structure, frontend type definitions, local settings persistence, and backend Git command handling. It also has migration complexity because existing users may already have `git_platform`, `git_token`, and `git_repository` saved in local settings.

## Goals / Non-Goals

**Goals:**
- Introduce a Git configuration model that separates remote description from authentication mode.
- Support two remote configuration modes: preset platform fields and custom remote URL.
- Support self-hosted Gitea through a configurable base URL in preset mode.
- Support HTTPS token authentication and SSH authentication.
- Preserve compatibility for existing GitHub, GitLab, and Gitee configurations by mapping legacy stored fields into the new model.
- Ensure both Git initialization and Git sync flows operate from the same resolved Git target.
- Update frontend Git configuration completeness checks so valid SSH/custom remote configurations are recognized.

**Non-Goals:**
- Rework Git credential handling to eliminate token-bearing remote URLs in this change.
- Add new Git operations such as fetch, pull, branch management, or repository browsing.
- Persist Git settings in SQLite or redesign the local settings storage mechanism beyond the new field set.
- Introduce a full backend Git service layer unless needed to keep the implementation maintainable.

## Decisions

### Decision: Represent Git settings as remote config plus auth config
Git settings will be modeled as two coordinated parts:
- remote config: `mode`, `platform`, `baseUrl`, `repository`, `remoteUrl`
- auth config: `authType`, `username`, `token`

This matches the real degrees of freedom in Git configuration. The current model overuses `platform` as a proxy for host, remote format, and credential style. Splitting the model keeps self-hosted Gitea, SSH remotes, and future remote variations within the same structure.

**Alternatives considered:**
- Add only a new `gitea` platform and `git_base_url` field. Rejected because it still leaves remote construction tied to platform-specific branching and does not solve custom remote support.
- Replace all platform configuration with custom remote URL only. Rejected because preset platform mode remains simpler for common hosted cases.

### Decision: Keep preset and custom remote modes in the UI and settings
Preset mode will cover GitHub, GitLab, Gitee, and Gitea. Custom mode will accept a full Git remote URL. Preset mode remains the default because it is simpler for common cases, while custom mode covers private deployments and SSH-first setups.

**Alternatives considered:**
- Preset-only configuration. Rejected because it still forces every future variation through platform expansion.
- Custom-only configuration. Rejected because it removes convenience for the common hosted cases already supported by the product.

### Decision: Parse settings into a normalized backend config before executing Git commands
`src-tauri/src/git.rs` will stop interpreting raw setting keys inline. Instead, backend logic will first load and validate a normalized Git config, then resolve a canonical remote target and execution strategy, and only then run Git commands.

This keeps `init_git_repository` and `sync_git_repository` aligned and prevents platform-specific branches from spreading further through command handlers.

**Alternatives considered:**
- Keep inline branching in each command. Rejected because both init and sync must share the same rules, and duplication would grow as new modes are added.

### Decision: Reuse legacy settings through implicit migration on read
Existing saved values for `git_platform`, `git_token`, and `git_repository` will remain valid. When new settings are absent, backend parsing will treat legacy values as preset mode with token auth and a provider default base URL.

This avoids forcing users to revisit settings after upgrade and fits the current local settings migration pattern already used by the settings service.

**Alternatives considered:**
- One-time destructive migration that rewrites all settings immediately. Rejected because it adds avoidable migration risk and couples rollout to storage mutation timing.

### Decision: Sync flow will verify or refresh origin before pushing
Git sync will no longer assume that `origin` already matches the active settings. Before pushing, the backend will resolve the current target and ensure the repository remote matches it.

This prevents stale remotes when users update Git settings after initial setup, especially when moving from a hosted provider to self-hosted Gitea or from HTTPS to SSH.

**Alternatives considered:**
- Only update origin during explicit initialization. Rejected because it creates hidden drift between saved settings and actual push target.

## Risks / Trade-offs

- [More settings fields increase UI complexity] → Mitigation: use mode-driven conditional fields so users only see the inputs relevant to their chosen remote and auth type.
- [Legacy compatibility logic can mask malformed mixed configurations] → Mitigation: centralize parsing and validation so incomplete combinations fail with explicit configuration errors.
- [HTTPS token formatting still differs by provider] → Mitigation: limit provider-specific behavior to the final credential injection step instead of embedding it in overall remote resolution.
- [Sync now mutates remotes when settings change] → Mitigation: constrain the mutation to `origin` only and keep the target resolution deterministic from saved settings.
- [SSH support depends on external system Git configuration] → Mitigation: document this in the UI and treat SSH validation failures as configuration/runtime errors rather than attempting local key management.

## Migration Plan

1. Extend the local settings allowlist to persist the new Git fields.
2. Update frontend Git types and settings UI to read/write the new model.
3. Implement backend Git config parsing with fallback from legacy stored fields.
4. Refactor Git init and sync flows to use the normalized config and resolved target.
5. Update frontend Git configuration completeness checks to align with the new model.
6. Verify legacy GitHub/GitLab/Gitee settings continue to function without manual re-entry.

Rollback strategy: revert the frontend form and backend parser changes together. Legacy fields remain available, so rollback can fall back to the previous platform-driven behavior without data loss as long as the legacy keys are still preserved.

## Open Questions

- Should the app add a dedicated `test_git_connection` command in this change, or leave that for a follow-up once the configuration model is stable?
- For HTTPS token auth in self-hosted Gitea, should username remain optional in the UI with backend validation, or should specific remote strategies require it more explicitly?
