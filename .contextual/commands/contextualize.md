---
config:
  CONTEXT_ROOT: README.md
  CONTEXT_DIR: .contextual/context/
  STRUCTURE:
    "technology.md": "Concentrate on technical implementation details (specifications, architecture, libraries, APIs, settings)"
    "product.md": "Emphasize user experience and product strategy aspects (personas, user stories, design, opportunities, constraints)"
    "domains.md": "Focus on pure business logic elements (definitions, entities, business rules, features)"
---
# Goal

You're a leader responsible for providing detailed and concise contextual information for project execution. Link out to relevant project files.

**CONSTRAINT: ONLY MODIFY FILES IN `${CONTEXT_DIR}`** - This command manages context documentation, not source code.

# User Input

```text
${ARGUMENTS}
```

# Process

## 1. Setup & Discovery
- **Initialize**: Run `ls -la ${CONTEXT_DIR}` or `mkdir -p ${CONTEXT_DIR}` if missing
- **Empty input**: Create files based on `${STRUCTURE}` config, add to `${CONTEXT_ROOT}` "Context Files" section, then STOP
- **Scan changes**: Run `git diff --name-only --cached` and `git diff --name-only` for recent modifications
- **Read context**: Use `find ${CONTEXT_DIR} -name "*.md" -type f` to get all context files, read each one
- **Global context**: Read `${CONTEXT_ROOT}` if exists for project-wide conventions
- **Follow links**: Track `[text](path)` or `[[link]]` references (max depth: 3)

## 2. Parse & Analyze
**Extract from user input:**
- Keywords (domain terms, technical concepts, business requirements)
- Intent (add/update/clarify/remove)
- Scope (which context files are relevant)
- Priority (urgent/critical/important indicators)

**Patterns:**
- "Add [concept] to [domain]" → Update specific context file
- "Update [existing info]" → Modify existing content
- "Clarify [unclear term]" → Add definition/explanation
- "Remove [outdated info]" → Delete/update obsolete content

**Gap analysis:**
- Missing concepts, incomplete relationships, outdated information, ambiguous references

## 3. Clarify & Update
**Prompt for clarity** using `[NEEDS CLARIFICATION: question?]` format when:
- Concepts are vague (ask for specific details)
- Abstract concepts need examples
- Scope could apply to multiple domains
- Assumptions about existing context need verification

**Update context files:**
- Add new concepts with definitions and relationships
- Update existing content, maintain consistency
- Preserve structure, use consistent markdown formatting
- Include cross-references and timestamps for major updates
- Create bidirectional links between related concepts

# Output

- Updated `${CONTEXT_DIR}` files with new information
- Concise updates with `[NEEDS CLARIFICATION: question?]` prompts for missing info
- Structured markdown with cross-references

# Next Steps

1. Review updated context files for completeness
2. Address clarification prompts
3. Use `/specify`, `/clarify`, or `/analyze` as needed

# Guidelines & Error Handling

**Core Rules:**
- ✅ ONLY modify files in `${CONTEXT_DIR}` directory
- ❌ NEVER touch source code, commands, specs, or configs
- Always update existing files over creating new ones
- Maintain single source of truth, use consistent terminology
- Ask specific questions rather than open-ended ones

**Common Issues & Solutions:**
- **Directory not found**: `mkdir -p ${CONTEXT_DIR}`
- **Permission denied**: `chmod 755 ${CONTEXT_DIR}`
- **Git commands failing**: Check `git status`, run `git init` if needed
- **File conflicts**: Ask user to clarify which information is correct
- **Corrupted files**: Backup with `cp -r ${CONTEXT_DIR} ${CONTEXT_DIR}.backup/` then recreate
- **Unclear input**: Ask for specific examples or rephrasing
