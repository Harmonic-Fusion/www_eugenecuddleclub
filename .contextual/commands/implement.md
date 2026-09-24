---
config:
  SPECS_DIR: specs
---

# Goal

Implement tasks from spec (spec-driven) OR execute a single task (task mode).

# Instructions

**Note**: As you proceed, replace variables with the actual values. Use the config frontmatter for some of the global variable replacement.Example:

- Input: "Set `${EXAMPLE}` as $(echo "hello world)"
- Output: Everywhere ${EXAMPLE} is replaced with "hello world" when evaluating.

# User Input

```text
${ARGUMENTS}
```

# Routing

1. Get branch: `git branch --show-current` → `${CURRENT_BRANCH}` (stop if `main`)
2. Set `${FEATURE_DIR}` = `${SPECS_DIR}/${CURRENT_BRANCH}`, `${FEATURE_CONTEXT}` = `${FEATURE_DIR}/context.md`
3. Replace all env variables with actual values.
4. If context doesn't exist → error, warn the user to run `/plan` first
5. Read ${FEATURE_CONTEXT} to see what tasks exist
6. Route based on user input:
   - User input references existing phase/task/section → **SPEC-DRIVEN** mode (implement tasks in the phase/task/section)
   - User input is a new instruction → **TASK** mode
   - User input is empty → **SPEC-DRIVEN** mode (next phase of uncompleted tasks)

# Mode: TASK

**When:** User input is a new instruction (not referencing existing spec tasks)

1. Analyze task based on user input.
2. Break down into subtasks and execute them systematically.
3. Validate implementation and handle errors
4. Track in ${FEATURE_CONTEXT}:
   - Read `${FEATURE_CONTEXT}`
   - Create "# Additional Tasks" section if needed
   - Add `- [x] ${ARGUMENTS}` and save

# Mode: SPEC-DRIVEN

**When:** User input references existing phase/task/section OR is empty

1. **Find linked files**: Scan ${FEATURE_CONTEXT} for links, follow recursively (depth: 3)

   - Patterns: `[text](path)`, `@file`, `./path`, `[[link]]`, `$VAR`
   - Types: .md, .txt, .json, .yaml, .js, .ts, .py, .sh
   - Skip: External URLs, binaries

2. **Extract tasks** from all files:

   - Uncompleted: `- [ ]`, `* [ ]`, `+ [ ]`
   - Ignore completed: `- [x]`, `* [x]`, `+ [x]`
   - Markers: `[HIGH]`, `[MEDIUM]`, `[LOW]`, `[CRITICAL]`, `TODO:`, `FIXME:`

3. **Filter tasks** (if user input provided):

   - Phase/section name → tasks in that section
   - Task number → specific task
   - Keywords → matching descriptions
   - None → next phase of uncompleted tasks

4. **Execute**:
   - Organize by priority and dependencies
   - Implement tasks, mark `- [x]` in ALL files containing the task after each
   - Continue on non-critical failures (document issues, only halt for critical errors)

# Both Modes: Tracking

- Update all files with `- [x]` completed markers for all tasks completed.
- Brief summary of changes implemented.
- Suggested commit message: `"feat: implement ${FEATURE}"`

# Next Steps

1. Review implementation results
2. Review changes in ${FEATURE_CONTEXT}
3. Use `/plan` to continue updating the plan.
4. Use `/commit` to commit changes.
