# Requirements Document: Login

## Introduction

Username/password login for MiniShop on all platforms.

## Requirements

### Requirement 1

**User Story:** As a shopper, I want to sign in with username and password, so that I can buy products.

#### Acceptance Criteria

1. WHEN the user submits valid credentials THEN the system SHALL call `POST /api/login` and navigate to `products`.
2. WHEN the password is shorter than 6 characters THEN the system SHALL reject the login without calling the backend.
3. WHEN login succeeds THEN the system SHALL persist the token via `TokenStore.save`.

### Requirement 2

**User Story:** As a test engineer, I want to inject a session through a deep link, so that tests can skip the login UI.

#### Acceptance Criteria

1. WHEN the app is opened with `minishop://login?token=<t>` THEN the system SHALL store the token before rendering.
2. WHEN the user taps `login_submit` with an empty username THEN the system SHALL show an SMS verification dialog.
