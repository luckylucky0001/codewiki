<!-- compound:proposed key="adr:.kiro/specs/login/implementation" -->
# 0002. Login 的实现约定

**Status**: Proposed
**Date**: 2026-10-21
**Related Spec**: `.kiro/specs/login/requirements.md`

## Context

规格 `.kiro/specs/login/requirements.md`（**Status**: Verified）中的 2 条需求已由代码核对通过。

## Decision

- WHEN the user submits valid credentials THE SYSTEM SHALL call `POST /api/login` and store the token.
- WHEN the password is shorter than 6 characters THE SYSTEM SHALL show an error.

## Consequences

改动这些行为时需要同步更新规格与本 ADR；`kb docs stale-specs` 会报告规格与代码的偏离。

## Evidence

- android://app/src/main/java/com/minishop/data/ApiService.kt#ApiService.login
- ios://MiniShop/Features/Login/LoginViewModel.swift#LoginViewModel.login
- android://app/src/main/java/com/minishop/ui/login/LoginViewModel.kt#LoginViewModel.login
