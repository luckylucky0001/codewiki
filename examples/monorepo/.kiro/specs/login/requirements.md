# Requirements Document: Login

**Status**: Verified
**Created**: 2025-11-02

### Requirement 1

1. WHEN the user submits valid credentials THE SYSTEM SHALL call `POST /api/login` and store the token.
2. WHEN the password is shorter than 6 characters THE SYSTEM SHALL show an error.
