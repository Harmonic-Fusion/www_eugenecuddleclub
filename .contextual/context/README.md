# Context Directory

This directory contains global project context that applies across all features and specifications.

## Purpose

The `.contextual/context/` directory serves as a central knowledge base for:
- **Domain Knowledge**: Business rules, terminology, and domain-specific concepts
- **Architecture Documentation**: System design, patterns, and technical decisions
- **Development Guidelines**: Coding standards, best practices, and conventions
- **Technical Specifications**: API contracts, data models, and interfaces
- **Project Constraints**: Requirements, limitations, and non-functional requirements

## Usage

### Creating Context Files

Create markdown files in this directory to document project-wide information:

```bash
.contextual/context/
├── README.md              # This file
├── architecture.md        # System architecture overview
├── domain.md             # Business domain concepts
├── guidelines.md         # Development standards
├── api-contracts.md      # API specifications
└── constraints.md        # Project limitations
```

### Referencing Context in Specifications

Reference context files from feature specifications using relative paths:

```markdown
# Feature Context
See [Architecture Overview](../../.contextual/context/architecture.md) for system design.
```

### Using Context with Commands

- **`/specify`**: AI automatically scans context when creating new specifications
- **`/clarify`**: Update context when refining requirements
- **`/contextualize`**: Add or update context files directly
- **`/analyze`**: Generate context from existing codebase

## Best Practices

1. **Keep context files focused**: One topic per file
2. **Use clear headings**: Organize with markdown sections
3. **Link related documents**: Cross-reference between context files
4. **Update regularly**: Keep context current as project evolves
5. **Version with git**: Context is part of your repository

## Examples

### domain.md
```markdown
# Business Domain

## Core Concepts
- **User**: Person who interacts with the system
- **Subscription**: Recurring payment arrangement
- **Feature**: Functionality available to users

## Business Rules
1. Users must verify email before accessing features
2. Subscriptions renew automatically unless cancelled
```

### architecture.md
```markdown
# System Architecture

## Overview
Microservices architecture with event-driven communication

## Services
- **Auth Service**: User authentication and authorization
- **API Gateway**: Request routing and rate limiting
- **User Service**: User profile management
```

## Configuration

Context directory location is configurable in `.contextual/config.yaml`:

```yaml
# Optional: Override context root location
# context_root: .contextual/context/README.md
```
