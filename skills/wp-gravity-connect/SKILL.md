---
name: wp-gravity-connect
description: "Use when integrating Gravity Forms with OpenAI via Gravity Connect: configuring OpenAI Fields (real-time pre-submission AI) or OpenAI Feeds (async post-submission processing), setting token ceilings, routing through OpenRouter, using GPT Image generation, voice-to-text transcription, or building AI-powered form workflows."
license: GPL-2.0-or-later
optional: true
---

# Gravity Connect — OpenAI Integration

Gravity Connect (OpenAI Connection) integrates Gravity Forms directly with OpenAI for AI text generation, image creation, voice transcription, and automated entry processing. Part of the Gravity Wiz ecosystem, installed via Spellbook.

## When to use

- Setting up AI text generation inside a form (before submission)
- Configuring post-submission AI processing (email drafting, classification, tagging)
- Building AI-powered form moderation
- Generating images with GPT Image from form data
- Voice-to-text transcription in forms
- Routing prompts through OpenRouter for model hot-swapping
- Setting token limits to control API costs

## Official documentation

| Resource | URL |
|----------|-----|
| Gravity Connect docs | https://gravitywiz.com/documentation/gravity-connect/ |
| OpenAI Connection docs | https://gravitywiz.com/documentation/gravity-connect-openai/ |
| Fields reference | https://gravitywiz.com/documentation/gravity-connect-openai/#fields |
| Feeds reference | https://gravitywiz.com/documentation/gravity-connect-openai/#feeds |
| GPT Image guide | https://gravitywiz.com/how-to-generate-ai-images-in-gravity-forms/ |
| AI text generation | https://gravitywiz.com/generate-text-gravity-forms-openai/ |
| AI moderation | https://gravitywiz.com/gravity-forms-moderation-gc-openai/ |
| Social media automation | https://gravitywiz.com/spotlight-social-media-gravity-forms-openai/ |
| Installation (via Spellbook) | https://gravitywiz.com/documentation/spellbook/ |
| Account dashboard | https://account.gravitywiz.com/ |
| Support | https://gravitywiz.com/support/ |

## GitHub

- Legacy open-source reference: https://github.com/gravitywiz/gravityforms-openai

---

## Fields vs Feeds — choose the right integration point

| | **OpenAI Fields** | **OpenAI Feeds** |
|-|-------------------|-----------------|
| **Trigger** | Before submission (real-time) | After submission (async) |
| **User waits?** | Yes — keep prompts fast | No — background processing |
| **Use for** | Live translation, grammar check, real-time summary, image preview | Email drafts, DB tagging, routing, moderation, classification |
| **Token budget** | Small (user is waiting) | Larger acceptable |

**Rule**: Default to Feeds unless the use case requires real-time display before the user submits.

---

## Procedure

### 1) Install via Spellbook

Gravity Connect is not a standalone plugin — it installs through Spellbook (the Gravity Wiz platform):

1. Install and activate **Spellbook** from your account dashboard: https://gravitywiz.com/download/spellbook
2. In wp-admin: **Spellbook → Connect → OpenAI Connection → Install**
3. Or activate from your account: https://account.gravitywiz.com/

```bash
# After downloading Spellbook zip
wp plugin install spellbook.zip --activate
# Then install OpenAI Connection from the Spellbook UI in wp-admin
```

### 2) Connect your OpenAI account

1. Create an API key: https://platform.openai.com/api-keys
2. In wp-admin: **OpenAI Connection → Settings → Secret Key** → paste key
3. **Important**: Store in `wp-config.php` constant, not the settings UI:

```php
// wp-config.php
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY'));
```

### 3) Configure OpenAI Fields (real-time)

1. Form editor → **Advanced Fields → OpenAI field**
2. Set **Endpoint** (Text, Image, Audio)
3. Write **Prompt** using Gravity Forms merge tags: `{field_label:1}`, `{all_fields}`
4. Set **Maximum Tokens** — always required

### 4) Configure OpenAI Feeds (post-submission)

1. Form → **Settings → OpenAI**
2. **Add New Feed**
3. Choose model (e.g., `gpt-4o-mini` for cost efficiency)
4. Write prompt with merge tags
5. Set **Maximum Tokens** (required — see token ceilings below)
6. Map the AI response to a field or send via notification merge tag

### 5) Token ceilings — always set

Every feed and field **must** have `Maximum Tokens` set to prevent runaway costs.

| Task | Recommended max tokens |
|------|----------------------|
| Categorization / routing | 50–100 |
| Email subject line | 50–75 |
| Email body draft | 200–400 |
| Summary | 150–250 |
| Grammar / rewrite | 100–200 |
| Moderation decision | 50–100 |
| Image prompt → image | 256 (tokens don't apply to image size) |

### 6) OpenRouter — hot-swap models without code changes

Route through OpenRouter to use cheaper open-source models:

```
OpenAI Connection → Settings → Custom Base URL:
  https://openrouter.ai/api/v1

Model examples:
  meta-llama/llama-3-8b-instruct  (cheap, fast)
  anthropic/claude-3-haiku         (quality, affordable)
  mistralai/mistral-7b-instruct    (open source)
```

Use cheaper models for tagging/categorization feeds; expensive models only when quality matters.

### 7) GPT Image generation

Field type: **OpenAI → Image**. Add to form for pre-submission image preview or post-submission image storage.

```
Prompt: "Professional headshot of {Name:1}, corporate style, white background"
Size: 1024x1024
Store URL in: Image Field 5
```

---

## Security and cost controls

```php
// wp-config.php — credentials in constants, not wp_options
define('OPENAI_API_KEY', getenv('OPENAI_API_KEY'));

// Set spending limits in OpenAI Platform dashboard:
// https://platform.openai.com/account/limits
```

Set alerts in your OpenAI project dashboard for unexpected spend spikes.

## References

- `wp-gravity-forms` skill — forms and entries setup
- `wp-gravity-wiz` skill — Spellbook installation
- OpenAI Platform: https://platform.openai.com/
- OpenRouter: https://openrouter.ai/
