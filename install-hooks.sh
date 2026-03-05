#!/bin/sh
set -e

cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

section() { printf "\n${BOLD}${CYAN}▶ %s${RESET}\n" "$1"; }
pass()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail()    { printf "  ${RED}✗${RESET} %s\n" "$1"; }

# ── Prettier ─────────────────────────────────────────────────────────────────
section "Prettier"
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(astro|ts|js|mjs|md|json|css)$')
if [ -n "$STAGED" ]; then
  echo "$STAGED" | xargs npx prettier --write --log-level warn
  echo "$STAGED" | xargs git add
  COUNT=$(echo "$STAGED" | wc -l | tr -d ' ')
  pass "Formatted and re-staged $COUNT file(s)"
else
  pass "No files to format"
fi

# ── ESLint ────────────────────────────────────────────────────────────────────
section "ESLint"
LINT_OUTPUT=$(npm run lint 2>&1)
LINT_STATUS=$?
if [ $LINT_STATUS -ne 0 ]; then
  echo "$LINT_OUTPUT"
  fail "Lint errors found — fix them before committing"
  exit 1
fi
pass "No lint errors"

# ── Astro check ───────────────────────────────────────────────────────────────
section "Astro check"
CHECK_OUTPUT=$(npm run astro -- check 2>&1)
CHECK_STATUS=$?
echo "$CHECK_OUTPUT" | grep -E "Result|error|warning|hint" | sed 's/^/  /'
if [ $CHECK_STATUS -ne 0 ]; then
  fail "Type errors found — fix them before committing"
  exit 1
fi
pass "No type errors"

printf "\n"
EOF

cat > .git/hooks/pre-push << 'EOF'
#!/bin/bash
GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

section() { printf "\n${BOLD}${CYAN}▶ %s${RESET}\n" "$1"; }
pass()    { printf "  ${GREEN}✓${RESET} %s\n" "$1"; }
fail()    { printf "  ${RED}✗${RESET} %s\n" "$1"; }

section "Production build"
npm run build
if [ $? -ne 0 ]; then
  fail "Build failed — fix errors before pushing"
  printf "\n"
  exit 1
fi
pass "Build succeeded"
printf "\n"
EOF

chmod +x .git/hooks/pre-commit .git/hooks/pre-push
echo "Git hooks installed."
