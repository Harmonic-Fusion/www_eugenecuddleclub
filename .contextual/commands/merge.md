---
config:
  MAIN_BRANCH: main
  MERGE_TEMPLATE: |
    Merge {FEATURE_BRANCH}: {DESCRIPTION}
    - {commit_hash}: one line per commit included.
    ...
    spec: {FEATURE_CONTEXT}
---
# Goal

Analyze the current feature branch and spec to generate a summary commit message, then perform a squash merge to main branch.

# User Input

```text
${ARGUMENTS}
```

# Steps

## 1. Check Prerequisites

1. Set `${MAIN_BRANCH}` = `main` (from config)
2. Execute prerequisites

   - `git branch --show-current` => ${FEATURE_BRANCH}
   - `git diff-index --quiet HEAD -- ; echo $?` => ${UNCOMMITTED_CHANGES}
   - `git ls-files --others --exclude-standard` => ${UNTRACKED_FILES}
   - `git diff --name-only ${MAIN_BRANCH}...${FEATURE_BRANCH}` => ${CHANGED_FILES}
   - `git log ${MAIN_BRANCH}..${FEATURE_BRANCH} --oneline` => ${COMMIT_LOG}
   - `git rev-list ${FEATURE_BRANCH}..${MAIN_BRANCH} --count` => ${MAIN_AHEAD_COUNT}

3. ${FEATURE_BRANCH} == ${MAIN_BRANCH} → STOP, tell user to switch to a feature branch first
4. If ${MAIN_AHEAD_COUNT} > 0 → STOP, tell user that ${MAIN_BRANCH} has new commits and to rebase or merge ${MAIN_BRANCH} into ${FEATURE_BRANCH} first
5. If ${UNCOMMITTED_CHANGES} != 0 → STOP, tell user to commit first
6. If ${UNTRACKED_FILES} is not empty → WARN user but continue
7. If ${CHANGED_FILES} is empty → STOP, tell user to add some changes first

## 2. Analyze & Generate Message

1. Review the `${COMMIT_LOG}`, context.md files, and user input to generate a `${DESCRIPTION}`.
2. Set `${COMMIT_MESSAGE}` using ${MERGE_TEMPLATE}. Replace with these variables
   - `{FEATURE_BRANCH}` with `${FEATURE_BRANCH}`
   - `{DESCRIPTION}` with `${DESCRIPTION}`
   - `{FEATURE_CONTEXT}` with path to context.md file(s)

## 3. Squash Merge

1. `git checkout ${MAIN_BRANCH}` → STOP if error
2. `git merge --squash ${FEATURE_BRANCH}` → STOP if error, resolve manually by user
3. `git commit -m "${COMMIT_MESSAGE}"`

# Output

- Brief summary of the merge

# Next Steps

After running this command:

1. Review the merge results
2. Verify the commit message is appropriate
3. Clean up feature branch if desired (manual cleanup)
4. push to remote if desired

# Guidelines

**Prerequisites:**
- Must be run from feature branch (not ${MAIN_BRANCH})
- Feature specification file must exist
- No uncommitted changes allowed

**Merge Behavior:**
- Squash merge combines all commits into one
- Feature branch left intact for manual cleanup
- No automatic task validation (merges regardless of completion status)

**Error Handling:**
- Abort on conflicts and show detailed error messages
- Stop on any git operation failures
