## ADDED Requirements

### Requirement: Users can configure Git remotes with preset platform mode
The system SHALL allow users to configure a Git remote in preset platform mode using a platform identifier and a repository path. The system MUST support GitHub, GitLab, Gitee, and Gitea in preset mode. The system MUST allow a service base URL to be provided for Gitea and MUST preserve provider default base URLs for the hosted preset platforms.

#### Scenario: Configure hosted preset platform
- **WHEN** a user selects GitHub, GitLab, or Gitee in preset mode and enters a repository path in `owner/repo` format
- **THEN** the system SHALL save the preset platform configuration and resolve the remote using the provider default base URL

#### Scenario: Configure self-hosted Gitea preset platform
- **WHEN** a user selects Gitea in preset mode and provides both a service base URL and a repository path in `owner/repo` format
- **THEN** the system SHALL save the configuration and resolve the remote using the provided service base URL and repository path

### Requirement: Users can configure Git remotes with custom remote mode
The system SHALL allow users to configure a Git remote by supplying a full remote URL instead of platform-specific fields. The system MUST accept custom remote URLs for both HTTPS and SSH transports.

#### Scenario: Configure custom HTTPS remote
- **WHEN** a user selects custom remote mode and enters a full HTTPS Git remote URL
- **THEN** the system SHALL save the custom remote configuration and use that URL as the canonical remote target

#### Scenario: Configure custom SSH remote
- **WHEN** a user selects custom remote mode and enters a full SSH Git remote URL
- **THEN** the system SHALL save the custom remote configuration and use that URL as the canonical remote target

### Requirement: Git commands use resolved remote targets from saved configuration
The system SHALL derive the Git remote used by repository initialization and synchronization from the saved Git remote configuration instead of hardcoded provider-specific URL construction embedded in command handlers.

#### Scenario: Initialize repository from saved remote configuration
- **WHEN** a user initializes the local Git repository after saving a valid preset or custom remote configuration
- **THEN** the system SHALL configure the repository origin to match the resolved remote target from the saved configuration

#### Scenario: Sync repository after remote configuration changes
- **WHEN** a user changes the saved Git remote configuration after a repository has already been initialized and then runs Git sync
- **THEN** the system SHALL reconcile the repository origin with the currently saved remote target before pushing
