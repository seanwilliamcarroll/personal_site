#!/bin/sh
set -e

cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
echo "Running astro check..."
npm run astro -- check
if [ $? -ne 0 ]; then
  echo "astro check failed. Fix errors before committing."
  exit 1
fi
EOF

cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
echo "Running full build..."
npm run build
if [ $? -ne 0 ]; then
  echo "Build failed. Fix errors before pushing."
  exit 1
fi
EOF

chmod +x .git/hooks/pre-commit .git/hooks/pre-push
echo "Git hooks installed."
