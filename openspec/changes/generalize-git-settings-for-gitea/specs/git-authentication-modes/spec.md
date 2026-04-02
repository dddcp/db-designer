## ADDED Requirements

### Requirement: Users can choose Git authentication mode
The system SHALL allow users to choose between HTTPS token authentication and SSH authentication for Git synchronization.

#### Scenario: Select token authentication
- **WHEN** a user chooses token authentication in Git settings
- **THEN** the system SHALL require token-based credentials appropriate for the configured remote

#### Scenario: Select SSH authentication
- **WHEN** a user chooses SSH authentication in Git settings
- **THEN** the system SHALL save SSH as the active authentication mode and use system Git SSH configuration for Git operations

### Requirement: Token authentication settings are preserved independently from remote structure
The system SHALL persist token authentication fields separately from remote description fields so that token-based authentication can be used with either preset platform remotes or custom HTTPS remotes.

#### Scenario: Save token auth for preset remote
- **WHEN** a user saves token authentication while using preset platform mode
- **THEN** the system SHALL persist the token authentication fields without requiring a custom remote URL

#### Scenario: Save token auth for custom HTTPS remote
- **WHEN** a user saves token authentication while using a custom HTTPS remote URL
- **THEN** the system SHALL persist the token authentication fields and associate them with the custom remote configuration

### Requirement: Invalid remote and authentication combinations are rejected
The system MUST reject Git configurations whose remote transport and authentication mode are incompatible.

#### Scenario: Reject token auth with SSH remote
- **WHEN** a user configures token authentication together with an SSH remote URL
- **THEN** the system SHALL reject the configuration as invalid

#### Scenario: Reject SSH auth with incompatible remote expectations
- **WHEN** a user configures SSH authentication with a remote format that the system cannot use as an SSH transport target
- **THEN** the system SHALL reject the configuration as invalid and report a configuration error
