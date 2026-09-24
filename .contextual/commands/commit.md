---
config:
  MAIN_BRANCH: main
---
# Goal

Create a git commit with a conventional commit message based on current changes.

# User Input

```text
${ARGUMENTS}
```

Optional: Commit message or specific files to stage.

# Steps

## 1. Check Git Status

1. Run: `git status --porcelain` → `${CHANGED_FILES}`
2. If no changes → notify user and exit

## 2. Generate Commit Message

**If user provided message:**
- Use ${ARGUMENTS} as commit message

**If no message provided:**
1. Analyze ${CHANGED_FILES} to determine commit type:
   - `feat` → New feature
   - `fix` → Bug fix
   - `docs` → Documentation only
   - `refactor` → Code restructuring
   - `test` → Test changes
   - `chore` → Maintenance/tooling

2. Create description:
   - Use present tense ("add" not "added")
   - Start with lowercase
   - Be specific but brief

3. Format: `${TYPE}: ${DESCRIPTION}`

**Examples:**
- `feat: add merge command with prerequisites check`
- `docs: update README with installation instructions`
- `fix: correct function name in validation`

## 3. Stage and Commit

1. Stage changes:
   - All: `git add .`
   - Specific: `git add ${ARGUMENTS}` (if files specified)

2. Commit: `git commit -m "${COMMIT_MESSAGE}"`

# Output

Summary of commit with message and files changed.

# Next Steps

1. Push changes: `git push`
2. Use `/merge` to merge to ${MAIN_BRANCH}

# Guidelines

**Commit Types:**
- Use `feat` for new functionality, `fix` for bugs, `docs` for documentation
- Omit scope unless changes are focused in one directory
- Keep descriptions concise and action-oriented
