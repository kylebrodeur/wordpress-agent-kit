#!/usr/bin/env bash
# setup-github.sh — configure GitHub repo for WP Engine CI/CD using the gh CLI.
#
# Checks authentication, reports missing secrets, sets them interactively or
# from provided values, and configures branch protection for deploy branches.
#
# Usage:
#   bash .agents/skills/wp-bootstrap/scripts/setup-github.sh [OPTIONS]
#
# Options:
#   --check-only        Report status without making any changes (default if no --set-*)
#   --set-secrets       Interactively set missing WP Engine secrets
#   --set-protection    Configure branch protection for main/staging/develop
#   --set-all           Set secrets + branch protection
#   --wpe-key=<file>    Path to WP Engine SSH private key (default: ~/.ssh/wpengine_ed25519)
#   --wpe-prod=<slug>   WP Engine production install slug
#   --wpe-staging=<slug> WP Engine staging install slug
#   --wpe-dev=<slug>    WP Engine dev install slug
#   --no-confirm        Skip confirmation prompts (use with care)
#
# Requires: gh CLI installed and authenticated (gh auth login)
#
# Exit codes:
#   0  All checks passed / actions completed
#   1  Error or user cancelled
#   2  gh CLI not installed or not authenticated

set -uo pipefail

# ── Parse args ────────────────────────────────────────────────────────────────
CHECK_ONLY=true
SET_SECRETS=false
SET_PROTECTION=false
WPE_KEY_FILE="${HOME}/.ssh/wpengine_ed25519"
WPE_PROD=""
WPE_STAGING=""
WPE_DEV=""
NO_CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --check-only)        CHECK_ONLY=true ;;
    --set-secrets)       SET_SECRETS=true; CHECK_ONLY=false ;;
    --set-protection)    SET_PROTECTION=true; CHECK_ONLY=false ;;
    --set-all)           SET_SECRETS=true; SET_PROTECTION=true; CHECK_ONLY=false ;;
    --wpe-key=*)         WPE_KEY_FILE="${arg#--wpe-key=}" ;;
    --wpe-prod=*)        WPE_PROD="${arg#--wpe-prod=}" ;;
    --wpe-staging=*)     WPE_STAGING="${arg#--wpe-staging=}" ;;
    --wpe-dev=*)         WPE_DEV="${arg#--wpe-dev=}" ;;
    --no-confirm)        NO_CONFIRM=true ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*" >&2; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
info() { printf '  \033[34m→\033[0m %s\n' "$*"; }
sep()  { printf '\n\033[1m── %s\033[0m\n' "$*"; }

confirm() {
  local prompt="${1} [y/N] "
  $NO_CONFIRM && { echo "(auto-confirmed)"; return 0; }
  read -r -p "$prompt" ans
  [[ "${ans,,}" == "y" || "${ans,,}" == "yes" ]]
}

# ── 1. Check gh CLI ───────────────────────────────────────────────────────────
sep "GitHub CLI check"

if ! command -v gh >/dev/null 2>&1; then
  fail "gh CLI not installed."
  echo "      Install: https://cli.github.com"
  echo "      macOS:   brew install gh"
  echo "      Linux:   sudo apt install gh  (or see above URL)"
  exit 2
fi
ok "gh $(gh --version | head -1 | awk '{print $3}')"

# ── 2. Check authentication ────────────────────────────────────────────────────
sep "Authentication"

AUTH_STATUS=$(gh auth status 2>&1)
if ! echo "$AUTH_STATUS" | grep -q "Logged in to github.com"; then
  fail "Not authenticated. Run: gh auth login"
  exit 2
fi

ACCOUNT=$(echo "$AUTH_STATUS" | grep -o 'account [^ ]*' | awk '{print $2}' | head -1)
ok "Authenticated as @${ACCOUNT}"

# ── 3. Detect repo ────────────────────────────────────────────────────────────
sep "Repository"

ORIGIN=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$ORIGIN" ]; then
  fail "No 'origin' remote found. Is this a git repo with a GitHub remote?"
  exit 1
fi

# Parse owner/repo from SSH or HTTPS URL
if [[ "$ORIGIN" =~ git@github\.com[:/]([^/]+)/([^.]+)(\.git)?$ ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
elif [[ "$ORIGIN" =~ https?://github\.com/([^/]+)/([^/.]+) ]]; then
  OWNER="${BASH_REMATCH[1]}"
  REPO="${BASH_REMATCH[2]}"
else
  fail "Cannot parse GitHub owner/repo from remote: $ORIGIN"
  exit 1
fi

# Verify repo is accessible
REPO_INFO=$(gh repo view "${OWNER}/${REPO}" --json name,owner,url,defaultBranchRef,visibility 2>&1)
if ! echo "$REPO_INFO" | grep -q '"name"'; then
  fail "Cannot access repo ${OWNER}/${REPO}. Check permissions."
  exit 1
fi

VISIBILITY=$(echo "$REPO_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['visibility'])" 2>/dev/null || echo "unknown")
DEFAULT_BRANCH=$(echo "$REPO_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['defaultBranchRef']['name'])" 2>/dev/null || echo "main")
REPO_URL=$(echo "$REPO_INFO" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])" 2>/dev/null || echo "")

ok "${OWNER}/${REPO} (${VISIBILITY,,}) — ${REPO_URL}"
info "Default branch: ${DEFAULT_BRANCH}"

# ── 4. Check secrets ──────────────────────────────────────────────────────────
sep "GitHub Secrets"

EXISTING_JSON=$(gh secret list --repo "${OWNER}/${REPO}" --json name 2>/dev/null || echo "[]")
EXISTING_SECRETS=$(echo "$EXISTING_JSON" | python3 -c "
import sys,json
secrets = json.load(sys.stdin)
for s in secrets: print(s['name'])
" 2>/dev/null || echo "")

# Define required secrets and their descriptions
declare -A SECRET_DESC
SECRET_DESC[WPE_SSH_KEY]="WP Engine SSH private key (contents of wpengine_ed25519)"
SECRET_DESC[WPE_SSH_KNOWN_HOSTS]="Known hosts for git.wpengine.com + ssh.wpengine.net"
SECRET_DESC[WPE_PROD_INSTALL]="Production install slug (e.g. mysite)"
SECRET_DESC[WPE_PROD_GIT_URL]="Production git push URL from WPE portal"
SECRET_DESC[WPE_STAGING_INSTALL]="Staging install slug (e.g. mysitestg)"
SECRET_DESC[WPE_STAGING_GIT_URL]="Staging git push URL from WPE portal"
SECRET_DESC[WPE_DEV_INSTALL]="Development install slug (e.g. mysitedev)"
SECRET_DESC[WPE_DEV_GIT_URL]="Development git push URL from WPE portal"
SECRET_DESC[WPE_API_USER]="WP Engine API username (from my.wpengine.com/api_access)"
SECRET_DESC[WPE_API_PASSWORD]="WP Engine API password"
SECRET_DESC[SLACK_WEBHOOK_URL]="Slack incoming webhook URL (optional)"

REQUIRED_SECRETS=(
  WPE_SSH_KEY WPE_SSH_KNOWN_HOSTS
  WPE_PROD_INSTALL WPE_PROD_GIT_URL
  WPE_STAGING_INSTALL WPE_STAGING_GIT_URL
  WPE_DEV_INSTALL WPE_DEV_GIT_URL
  WPE_API_USER WPE_API_PASSWORD
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
  if echo "$EXISTING_SECRETS" | grep -qx "$secret"; then
    ok "$secret"
  else
    warn "$secret — MISSING"
    MISSING_SECRETS+=("$secret")
  fi
done

# Optional
if echo "$EXISTING_SECRETS" | grep -qx "SLACK_WEBHOOK_URL"; then
  ok "SLACK_WEBHOOK_URL (optional)"
else
  info "SLACK_WEBHOOK_URL — not set (optional)"
fi

echo ""
if [ "${#MISSING_SECRETS[@]}" -eq 0 ]; then
  ok "All required secrets are set ✓"
else
  warn "${#MISSING_SECRETS[@]} secret(s) missing — run with --set-secrets to configure"
fi

# ── 5. Set missing secrets ────────────────────────────────────────────────────
if $SET_SECRETS && [ "${#MISSING_SECRETS[@]}" -gt 0 ]; then
  sep "Setting missing secrets"

  for secret in "${MISSING_SECRETS[@]}"; do
    echo ""
    info "Setting: ${secret}"
    info "Purpose: ${SECRET_DESC[$secret]}"

    VALUE=""

    case "$secret" in
      WPE_SSH_KEY)
        if [ -f "$WPE_KEY_FILE" ]; then
          info "Reading from $WPE_KEY_FILE"
          if confirm "  Set WPE_SSH_KEY from $WPE_KEY_FILE?"; then
            VALUE=$(cat "$WPE_KEY_FILE")
          fi
        else
          warn "Key file not found: $WPE_KEY_FILE"
          info "Alternatives:"
          info "  1. op read 'op://Employee/wpengine_ed25519/private key' > ~/.ssh/wpengine_ed25519"
          info "  2. Paste the key manually below (enter blank line when done)"
          if confirm "  Enter key manually?"; then
            LINES=()
            echo "  Paste private key (empty line to finish):"
            while IFS= read -r line; do
              [ -z "$line" ] && break
              LINES+=("$line")
            done
            VALUE=$(printf '%s\n' "${LINES[@]}")
          fi
        fi
        ;;

      WPE_SSH_KNOWN_HOSTS)
        info "Generating from ssh-keyscan..."
        VALUE=$(
          { ssh-keyscan -t rsa git.wpengine.com 2>/dev/null; ssh-keyscan -H ssh.wpengine.net 2>/dev/null; }
        )
        if [ -n "$VALUE" ]; then
          info "Generated $(echo "$VALUE" | wc -l) known_hosts entries"
          confirm "  Set WPE_SSH_KNOWN_HOSTS?" && true || VALUE=""
        else
          warn "ssh-keyscan failed — check network connectivity"
        fi
        ;;

      WPE_PROD_INSTALL)
        [ -n "$WPE_PROD" ] && VALUE="$WPE_PROD" || {
          read -r -p "  Production install slug (e.g. mysite): " VALUE
        }
        ;;

      WPE_PROD_GIT_URL)
        SLUG="${WPE_PROD:-}"
        if [ -z "$SLUG" ]; then
          # Try to get from wp-cli.yml
          SLUG=$(grep -A2 '@production' wp-cli.yml 2>/dev/null | grep 'ssh:' | awk '{print $2}' | cut -d@ -f1 || echo "")
        fi
        info "Get exact URL from: https://my.wpengine.com/installs/${SLUG:-<install>}/git_push"
        read -r -p "  Production git URL (e.g. git@git.wpengine.com:mysite.git): " VALUE
        ;;

      WPE_STAGING_INSTALL)
        [ -n "$WPE_STAGING" ] && VALUE="$WPE_STAGING" || {
          read -r -p "  Staging install slug (e.g. mysitestg): " VALUE
        }
        ;;

      WPE_STAGING_GIT_URL)
        SLUG="${WPE_STAGING:-}"
        info "Get exact URL from: https://my.wpengine.com/installs/${SLUG:-<install>}/git_push"
        read -r -p "  Staging git URL (e.g. git@git.wpengine.com:mysitestg.git): " VALUE
        ;;

      WPE_DEV_INSTALL)
        [ -n "$WPE_DEV" ] && VALUE="$WPE_DEV" || {
          read -r -p "  Dev install slug (e.g. mysitedev): " VALUE
        }
        ;;

      WPE_DEV_GIT_URL)
        SLUG="${WPE_DEV:-}"
        info "Get exact URL from: https://my.wpengine.com/installs/${SLUG:-<install>}/git_push"
        read -r -p "  Dev git URL (e.g. git@git.wpengine.com:mysitedev.git): " VALUE
        ;;

      WPE_API_USER)
        info "Find at: https://my.wpengine.com/api_access"
        read -r -p "  WP Engine API username: " VALUE
        ;;

      WPE_API_PASSWORD)
        info "Find at: https://my.wpengine.com/api_access"
        read -r -s -p "  WP Engine API password (hidden): " VALUE
        echo ""
        ;;
    esac

    if [ -n "$VALUE" ]; then
      echo "$VALUE" | gh secret set "$secret" --repo "${OWNER}/${REPO}"
      ok "$secret set"
    else
      warn "$secret skipped"
    fi
  done
fi

# ── 6. Branch protection ──────────────────────────────────────────────────────
sep "Branch Protection"

check_branch_protection() {
  local branch="$1"
  local prot
  prot=$(gh api "repos/${OWNER}/${REPO}/branches/${branch}/protection" 2>/dev/null || echo "")
  if [ -z "$prot" ] || echo "$prot" | grep -q '"message"'; then
    warn "${branch}: not protected"
    return 1
  fi
  local checks
  checks=$(echo "$prot" | python3 -c "
import sys,json
p = json.load(sys.stdin)
checks = p.get('required_status_checks',{}).get('contexts',[])
reviews = p.get('required_pull_request_reviews',{}).get('required_approving_review_count',0)
print(f'status checks={checks}, reviewers={reviews}')
" 2>/dev/null || echo "configured")
  ok "${branch}: protected (${checks})"
  return 0
}

BRANCHES_NEEDING_PROTECTION=()

for branch in "$DEFAULT_BRANCH" "staging" "develop"; do
  if ! check_branch_protection "$branch" 2>/dev/null; then
    BRANCHES_NEEDING_PROTECTION+=("$branch")
  fi
done

if [ "${#BRANCHES_NEEDING_PROTECTION[@]}" -eq 0 ]; then
  ok "Branch protection looks good"
elif ! $SET_PROTECTION; then
  warn "${#BRANCHES_NEEDING_PROTECTION[@]} branch(es) not protected — run with --set-protection to configure"
fi

# ── 7. Apply branch protection ────────────────────────────────────────────────
if $SET_PROTECTION && [ "${#BRANCHES_NEEDING_PROTECTION[@]}" -gt 0 ]; then
  sep "Configuring Branch Protection"

  for branch in "${BRANCHES_NEEDING_PROTECTION[@]}"; do
    echo ""
    info "Configuring: ${branch}"

    # Determine required reviewer count
    if [ "$branch" = "$DEFAULT_BRANCH" ]; then
      REVIEWERS=2  # Production needs 2
    else
      REVIEWERS=1  # Staging/develop needs 1
    fi

    # Required status checks — gate-passed is the canonical check from ci-gate.yml
    CONTEXTS='["gate-passed"]'

    # For production, also require staging-source-check
    if [ "$branch" = "$DEFAULT_BRANCH" ]; then
      CONTEXTS='["gate-passed","staging-source-check"]'
    fi

    if ! confirm "  Set ${branch} protection (${REVIEWERS} reviewers, checks: ${CONTEXTS})?"; then
      warn "${branch}: skipped"
      continue
    fi

    PAYLOAD=$(python3 -c "
import json
contexts = ${CONTEXTS}
payload = {
  'required_status_checks': {
    'strict': True,
    'contexts': contexts
  },
  'enforce_admins': True,
  'required_pull_request_reviews': {
    'dismiss_stale_reviews': True,
    'require_code_owner_reviews': False,
    'required_approving_review_count': ${REVIEWERS}
  },
  'restrictions': None,
  'allow_force_pushes': False,
  'allow_deletions': False
}
print(json.dumps(payload))
")

    if echo "$PAYLOAD" | gh api "repos/${OWNER}/${REPO}/branches/${branch}/protection" \
      --method PUT --input - >/dev/null 2>&1; then
      ok "${branch}: protection configured (${REVIEWERS} reviewer(s), checks: ${CONTEXTS})"
    else
      fail "${branch}: failed to configure protection"
      info "You may need admin access or a GitHub token with 'repo' scope"
    fi
  done
fi

# ── 8. Summary ────────────────────────────────────────────────────────────────
sep "Summary"

TOTAL_MISSING="${#MISSING_SECRETS[@]}"
TOTAL_UNPROTECTED="${#BRANCHES_NEEDING_PROTECTION[@]}"

if [ "$TOTAL_MISSING" -eq 0 ] && [ "$TOTAL_UNPROTECTED" -eq 0 ]; then
  ok "GitHub repo is fully configured for WP Engine CI/CD"
  ok "Secrets: all set | Branch protection: all configured"
else
  [ "$TOTAL_MISSING" -gt 0 ] && warn "Secrets missing: $TOTAL_MISSING (run --set-secrets)"
  [ "$TOTAL_UNPROTECTED" -gt 0 ] && warn "Branches unprotected: ${BRANCHES_NEEDING_PROTECTION[*]} (run --set-protection)"
  echo ""
  info "Re-run:  bash ${0} --set-all"
fi

echo ""
info "GitHub Actions:  https://github.com/${OWNER}/${REPO}/actions"
info "Secrets:         https://github.com/${OWNER}/${REPO}/settings/secrets/actions"
info "Branch rules:    https://github.com/${OWNER}/${REPO}/settings/branches"
echo ""
