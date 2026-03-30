---
name: qodo-pr-resolver
description: Review and resolve PR issues with Qodo - get AI-powered code review issues and fix them interactively (GitHub, GitLab, Bitbucket, Azure DevOps)
version: 0.3.0
triggers:
  - qodo.?pr.?resolver
  - pr.?resolver
  - resolve.?pr
  - qodo.?fix
  - fix.?qodo
  - qodo.?review
  - review.?qodo
  - qodo.?issues?
  - show.?qodo
  - get.?qodo
  - qodo.?resolve
---

# Qodo PR Resolver

Fetch Qodo review issues for the current branch's PR/MR, fix them interactively or in batch, and reply to inline comments.

## Quick Reference

Steps: check push status → detect provider → find PR → fetch+deduplicate Qodo comments → display severity table → "Review each" / "Auto-fix all" / "Cancel" → commit each fix → post summary → push.

Severity: "Action required" → CRITICAL/HIGH (always Fix). "Review recommended" → MEDIUM/LOW. "Other" → LOW.

Bot names: `pr-agent-pro`, `qodo-merge[bot]`, `qodo-ai[bot]`

## Setup / Troubleshooting

→ Read `reference.md` in this skill directory before proceeding.
