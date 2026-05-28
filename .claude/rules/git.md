# Git — never lose a parallel agent's work

This repo is frequently edited by **multiple concurrent Claude sessions /
agents at once**. The working tree at any moment may hold in-flight work
from another agent mid-refactor. The cardinal rule: **never lose, back
out, or fake another agent's work.**

## The cardinal rule

When a commit breaks the build because it pulled in working-tree files
that another concurrent session is mid-refactoring — files importing
symbols, helpers, or types that aren't on `HEAD` yet — **fix it by hand
as a developer**:

1. Identify the coherent set: the file you changed plus the
   not-yet-committed files it now depends on.
2. Build that set, write/stage the **real** files, commit normally so the
   snapshot actually compiles.
3. The other agent's work rides onto `master` **preserved**, never
   discarded.

## Hard prohibitions

- **NEVER use git plumbing tricks to fake a snapshot.** No
  `update-index --cacheinfo`, no `hash-object -w` + manual staging, no
  `--force-remove` to synthesize a tree that differs from the working
  tree. If the committed content can't be produced by a normal
  `git add` of real files on disk, you're doing it wrong.
- **NEVER revert in a way that un-ships or discards another agent's
  in-flight work.** A `git revert` that rolls the tree back past their
  changes erases them from the shipped history — don't.
- **NEVER overwrite or stash another session's working-tree changes.**
  No `git stash` to "clean up", no `git checkout -- <file>` /
  `git restore` on a file another agent is editing, no `Write` that
  clobbers their version. (See also the `never-stash-others-wip`
  memory.)

## Detect a concurrent session before you act

Signals that another agent is actively editing **right now** — do NOT
race it, do NOT commit a partial snapshot:

- `Another next build process is already running` (Next.js build lock).
- Files you didn't touch showing up modified/added/deleted in
  `git status`.
- A file you `Read` reporting "modified since read" mid-edit.
- New untracked files that committed files import (the tell-tale of a
  half-landed refactor — your commit will fail `Module not found`).

When you see these, the working tree belongs to someone else too. The
**whole** working tree is the only verified-coherent state (it's what
builds locally) — commit a coherent slice of it or wait, but never
fabricate or amputate.

## Why this rule exists (the concrete failure)

A "surgical" 6-file copy commit grabbed the working-tree versions of
`InsultHeader.tsx` and `ReportPlanPanel.tsx` that a parallel session was
mid-refactoring. Those files imported `ChatMode` (newly moved into
`chat/types.ts`) and a `toolStatus` helper — neither on `HEAD` yet. The
SWA build failed twice (`Module not found: ../chat/toolStatus`, then
`types has no exported member ChatMode`). The wrong instinct was to fake
the committed blobs with `update-index --cacheinfo` to "revert without
touching the working tree." Bernard's correction: **do the fix by hand,
no tricks, and never lose work done by the other agents.**

## How to apply

- Before a "surgical" commit while others may be editing: assume your
  target files depend on uncommitted siblings. `git add` the coherent
  dependency closure, not just the files you personally edited.
- If you can't build the full tree (e.g. build lock held by another
  session), **wait** for the lock — don't push an unverified partial.
- The live site only deploys on a green build, so a red `master` doesn't
  take the site down — but it blocks the next agent's deploy. Green it by
  completing the snapshot, not by amputating their work.
