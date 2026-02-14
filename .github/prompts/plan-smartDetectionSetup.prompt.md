# Plan: Smart Detection-First Setup Flow

Run triage before asking ANY questions. Only prompt when detection is unclear or user wants to override. Add "Not sure" options everywhere.

**TL;DR:** Flip the current flow - detect first, ask later. The script becomes intelligent: if it confidently detects your project type and tech stack, it just shows you what it found and asks for confirmation. Only falls back to questions if needed. Makes setup feel magical instead of interrogative.

**Key Changes from Current:**

Current: Ask → Run triage → Customize
**New:** Run triage → Show detection → Confirm or Override → Customize

## Steps

### 1. Restructure main flow in scripts/setup.mjs

- Move triage execution to run BEFORE any project questions (currently line 113)
- Place it right after kit installation check (after line 73)
- Actually call real triage script: `vendor/wp-agent-skills/skills/wp-project-triage/scripts/detect_wp_project.mjs`
- Parse JSON output into `triageResult` object

### 2. Create detection mapper

Map `triageResult.project.primary` to setup's project type options:
- `wp-block-theme` → `block-theme`
- `wp-block-plugin` → `blocks`
- `wp-plugin` → `plugin`
- `wp-theme` → `theme`
- `wp-site` → `site`

Map `triageResult.signals.*` to tech stack:
- `blockJsonFiles.length > 0` → add `gutenberg`
- `usesInteractivityApi` → add `interactivity`
- `hasRestEndpoints` → add `rest-api`
- `hasWpCliCommands` → add `wpcli`

Map `triageResult.tooling.*`:
- `tooling.php.hasComposerJson` → add `composer`
- `tooling.node.packageManager` → add `npm`
- `tooling.php.hasPhpStan` → add `phpstan`
- `signals.hasPlaygroundBlueprint` → add `playground`

### 3. Add confidence check and smart prompting

If `detectedType` exists AND `detectedTech` has items:
- Show `p.note()` with detected values in nice format
- Single confirm: "Use these detected values? (y/n)"
- If yes → skip all questions, use detected values
- If no → proceed to manual questions with detected values as defaults

If detection fails or finds nothing:
- Proceed directly to manual questions (no confirmation prompt)

### 4. Enhance question options

Add to project type select:
```javascript
{ value: 'unsure', label: "I'm not sure" }
```

Update tech stack message:
- Change "Select technologies used" → "Select technologies (or skip if unsure):"

Add `initialValue` / `initialValues` to all prompts:
- Use detected values if available
- Undefined otherwise (no pre-selection)

### 5. Remove redundant triage prompt

- Delete the old "Run project triage?" question (currently in `p.group` after techStack)
- Triage now always runs automatically
- Include graceful fallback if triage script missing/fails

### 6. Handle edge cases

- Wrap triage in try/catch - if fails, show "Auto-detection unavailable" and continue
- Check if triage script exists before attempting to run
- If user selects "I'm not sure" for type → default to `other` for AGENTS.md generation
- If tech stack is empty → generate minimal AGENTS.md with generic setup

## Verification

**Test detection works:**
```bash
# Should auto-detect and only confirm:
cd test-block-plugin
npm run setup

# Should detect partially and pre-fill:
cd test-theme-with-composer
npm run setup

# Should fall back to questions:
cd empty-directory
npm run setup
```

**Expected UX:**
- Fast projects (has clear WP structure): 1 confirmation prompt only
- Ambiguous projects: Questions with smart defaults pre-selected
- Empty/new projects: All questions, no pre-selection

## Decisions

**Decision: Triage runs unconditionally**
- Always attempt triage before questions
- Graceful degradation: if fails → proceed with questions
- User never sees errors, just "detection unavailable"

**Decision: Single confirmation vs detailed review**
- Chose: Single yes/no confirm on detection
- Alternative considered: Show detection, then let user edit each field
- Reasoning: Faster UX, user can override by saying "no"

**Decision: "I'm not sure" is an option, not required**
- Some users want to explore options
- Others know nothing about their project
- Giving them an explicit "unsure" choice prevents wrong guesses

**Decision: Keep tech stack optional**
- `required: false` stays
- Empty array is valid (means "detect later" or "none yet")
- AGENTS.md can still generate with minimal tech

---

## Phase 2: AI Enhancement Layer (Future)

### Optional Local AI for Natural Language Explanations

**Options:**
- **Transformers.js** (Xenova/transformers.js) - Runs ONNX models in Node
- **llama.cpp via llama-node** - Tiny local models (Phi-3.5-mini, TinyLlama)
- **Recommended:** Phi-3.5-mini-instruct (3.8B quantized → ~2GB) via llama.cpp

**Use Cases:**
- Convert triage JSON → friendly paragraph: "I detected a WordPress block plugin with Interactivity API usage across 3 blocks..."
- Explain recommendations: "I suggest adding PHPStan because..."
- Answer simple Q&A during setup

**Implementation:**
- New module: `scripts/lib/ai-explainer.mjs`
- Lazy-load model (only if user opts in with env var: `AI_EXPLAIN=1`)
- Fallback to templates if model loading fails
- Keep deterministic as default, AI as opt-in enhancement

**Interactive Q&A:**
- After showing recommendations, offer: "Have questions? (y/n)"
- Simple REPL-style Q&A using RAG over skill files
- Knowledge sources: All SKILL.md files + references
- Exit Q&A → continue setup

---

## Architecture Philosophy

**Core Principle:** Deterministic first, AI is additive

**Phase 1 (Implement Now):**
- Zero new dependencies
- Works offline
- Fast execution (< 5 seconds typical)
- Smart use of structured triage data

**Phase 2 (Optional Future):**
- Feature flag: `AI_EXPLAIN=1`
- Lazy-loaded AI models
- Graceful degradation always
- No cloud APIs, all local

**Aligns with project principles:**
- Prefer deterministic checks (see vendor/wp-agent-skills/docs/principles.md)
- Filesystem-based intelligence
- No "agent guesswork"

---

## Implementation Checklist

- [x] Create new branch: `feature/smart-detection`
- [x] Step 1: Restructure flow, call real triage
- [x] Step 2: Implement detection mapper
- [x] Step 3: Add confidence check and smart prompting
- [x] Step 4: Enhance question options with "unsure"
- [x] Step 5: Remove redundant triage question
- [x] Step 6: Add error handling for edge cases
- [x] Test on multiple project types
- [x] Document new behavior in README
- [x] Optional: Create lib/triage-mapper.mjs module for clean separation
- [ ] Optional: Create lib/agents-generator.mjs for template-based AGENTS.md generation
