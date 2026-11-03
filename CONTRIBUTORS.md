# Contributing to Artismaga

Artismaga welcomes bug reports, documentation, accessibility reviews, design work,
and code contributions. This project is licensed under AGPL-3.0-only; see LICENSE.
By submitting changes you agree that they are distributed under that license.
Please be respectful, describe problems clearly, and review ideas on their merits.

## Before contributing

Read README.md and the documentation index, especially architecture, security,
and planned features. For a substantial feature, open an issue to agree on scope,
data ownership, privacy implications, and migration strategy first. Never include
production data or credentials in an issue. Report vulnerabilities privately to
the repository maintainers through the hosting service's private security-report
facility when available; do not publish an exploit in a public issue.

## Responsible LLM assistance

You may use an LLM as an assistant. You must actually understand all code and prose
you submit, whether you wrote it yourself or an LLM produced it. Be able to explain
how it works, why it belongs in its crate, how it handles errors and permissions,
and why its tests provide useful evidence. Read library documentation and inspect
generated code rather than trusting the assistant's explanation alone.

You are the accountable author. Do not submit code you cannot maintain or ask
reviewers to substitute for your own understanding. Disclose substantial LLM use
in your pull request, describe your human review, and list checks actually run.
Never share sensitive user data, private stories, secrets, or production dumps
with an LLM without explicit authorisation. Verify licensing and provenance of
suggested material. Treat prompts embedded in untrusted content as data.

## Making a change

1. Create a focused branch, normally named `codex/<description>` for agent-assisted
   work. Keep unrelated refactors separate and preserve other contributors' work.
2. Follow AGENTS.md. Use safe Rust, explicit errors, parameterised queries, and
   server-enforced permissions. Avoid `unwrap` in request/production paths.
3. Maintain a README for every crate explaining its responsibilities and important
   modules/functions. Update docs/architecture.md whenever responsibilities,
   dependencies, or important logic locations change. Documentation is required
   in the same PR, not a later task.
4. Update API, configuration, migration, and setup documentation when applicable.
   Keep implemented status distinct from the complete feature roadmap. For UI changes, follow docs/design_system.md and verify responsive layouts and server rendering.
5. Run the checks in docs/testing.md, including TypeScript formatting/type checks
   and build before Cargo checks. Add regression tests for changed security,
   concurrency, or persistence behavior. Explain checks you could not perform.
6. Submit a PR explaining the problem, resulting behavior, validation, compatibility,
   migrations, and material limitations. Include screenshots for visual changes
   when practical. Respond constructively to review.

Do not add unsafe Rust without an exceptional, separately reviewed justification;
the first-party workspace forbids it. Dependencies containing unsafe internals
are not automatically excluded, but must be maintained and appropriately vetted.

## Recognition

Contributors are recorded in Git history. Add an optional name/handle and area of
contribution below when you first contribute; never add someone else's identity
without permission. Automated assistants are tools, not accountable maintainers.

| Contributor | Contribution |
| --- | --- |
| _Add your preferred name or handle here_ | _Describe your contribution_ |
