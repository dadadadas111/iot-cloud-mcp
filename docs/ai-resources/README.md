# AI-Optimized Resource Documentation

This directory contains simplified, AI-friendly documentation for the IoT Cloud MCP Bridge.

## Purpose

These documents are designed specifically for **AI agents** (LLMs) to:

- ✅ Understand device control concepts quickly
- ✅ Find exact command formats easily
- ✅ Follow clear step-by-step workflows
- ✅ Avoid common mistakes

## Files

### 1. `overview.md` (433 lines)

**Introduction to the IoT Cloud MCP Bridge**

**Contains:**

- System architecture overview
- Core concepts (device, element, attribute, state)
- Field definitions (uuid, elementIds, command)
- Available MCP tools
- Common patterns and workflows
- Glossary of terms
- Quick reference card

**Use when:** First time using the system, need to understand fundamental concepts

---

### 2. `device-attributes.md` (253 lines)

**Complete reference of device attributes and commands**

**Contains:**

- Quick reference table of common attributes
- Device-type-specific sections (lights, switches, AC, etc.)
- Command format examples with explanations
- Value ranges and meanings
- IR remote button codes
- Do's and Don'ts for AI agents

**Use when:** You need to know WHAT commands are available and their formats

---

### 3. `control-guide.md` (382 lines)

**Step-by-step guide for controlling devices**

**Contains:**

- 2 control options (simple actions vs direct commands)
- Step-by-step workflow
- Multi-element device control
- Common patterns and examples
- Timing considerations
- Troubleshooting guide

**Use when:** You need to know HOW to control a device (workflow)

---

### 4. `state-guide.md` (435 lines)

**Complete guide to reading and interpreting device state**

**Contains:**

- State structure explanation with visual examples
- 5+ real device examples (lights, switches, multi-element, AC)
- How to use state in code (verification, capability discovery)
- State array format details
- Common attribute ID reference table
- Full annotated examples

**Use when:** You need to READ device state or verify control commands worked

---

## Key Improvements Over Original Docs

### Before (Original Docs)

- ❌ Mixed Vietnamese and English
- ❌ CSV format hard to parse
- ❌ Technical API documentation style
- ❌ Scattered information
- ❌ No AI-specific guidance

### After (AI-Optimized Docs)

- ✅ 100% English, clear language
- ✅ Structured markdown with examples
- ✅ Tutorial/guide style with clear explanations
- ✅ Organized by use case
- ✅ Explicit AI agent guidance (Do's/Don'ts, decision trees)
- ✅ Real-world examples with annotations
- ✅ Quick reference sections for fast lookup

---

## How AI Agents Should Use These Resources

### Recommended Reading Order

**1. First Time Using the MCP:**
Read in this order:

1. `overview.md` - Core concepts and what you can do
2. `device-attributes.md` - Available commands and device types
3. `control-guide.md` - Control workflows
4. `state-guide.md` - Read and verify state

**2. When Controlling a Device:**

1. Read `control-guide.md` → Choose simple or advanced control
2. Reference `device-attributes.md` → Find command format
3. Reference `state-guide.md` → Verify command worked

**3. Quick Reference:**

- Need a command format? → `device-attributes.md` Quick Reference table
- Forgot the workflow? → `control-guide.md` Summary Checklist
- How to read state? → `state-guide.md` Quick Reference section

---

## Integration with MCP

These files are exposed as MCP resources:

```typescript
// List all resources
resources/list

// Read specific resource
resources/read { uri: "rogo://docs/overview" }
resources/read { uri: "rogo://docs/device-attributes" }
resources/read { uri: "rogo://docs/control-guide" }
resources/read { uri: "rogo://docs/state-guide" }
```

**Resource URIs:**

- `rogo://docs/overview` → `overview.md`
- `rogo://docs/device-attributes` → `device-attributes.md`
- `rogo://docs/control-guide` → `control-guide.md`
- `rogo://docs/state-guide` → `state-guide.md`

---

## Content Principles

All documentation follows these principles:

### ✅ AI-Friendly Writing

- Clear, direct language
- Active voice
- Short sentences and paragraphs
- Concrete examples over abstract concepts

### ✅ Actionable Content

- Every section answers "what do I do?"
- Step-by-step instructions
- Copy-paste-ready code examples
- Decision trees and checklists

### ✅ Complete Coverage

- No assumed knowledge
- All edge cases explained
- Error scenarios included
- Verification steps mandatory

### ✅ Structured Format

- Consistent heading hierarchy
- Visual separators (---) between major sections
- Code blocks with syntax highlighting
- Tables for quick reference

---

## Maintenance

When updating these docs:

1. **Keep it simple** - AI agents prefer clear over clever
2. **Add examples** - Every new concept needs a working example
3. **Update all three** - If you change device behavior, update relevant sections in all files
4. **Test with real AI** - Have an LLM read it and try to follow the instructions

**Files to update:**

- Source: `docs/ai-resources/*.md`
- Resource definitions: `src/resources/definitions/*.resource.ts` (already point to these files)

---

## Statistics

- **Total Lines**: 1,502 lines of AI-optimized documentation
- **overview.md**: 433 lines (29%)
- **device-attributes.md**: 252 lines (17%)
- **control-guide.md**: 382 lines (25%)
- **state-guide.md**: 435 lines (29%)

**Coverage:**

- 4 comprehensive guides (overview + 3 specialized guides)
- 8 device types documented
- 30+ attribute IDs explained
- 20+ workflow examples
- 100% MCP tool coverage
