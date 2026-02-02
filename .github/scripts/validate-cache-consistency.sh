#!/bin/bash
# Validate cache handling consistency across all workflows

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKFLOWS_DIR="$SCRIPT_DIR/../workflows"

echo "🔍 Validating cache handling consistency across workflows..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0
warnings=0

# Function to check if a workflow uses explicit cache restore/save pattern
check_explicit_pattern() {
    local workflow=$1
    local name=$(basename "$workflow")
    
    echo "Checking $name..."
    
    # Check if workflow has explicit restore + save pattern (correct)
    local has_restore=$(grep -B2 -A2 "path.*chromadb-data" "$workflow" | grep -c "uses: actions/cache/restore@v4" || true)
    local has_save=$(grep -B2 -A2 "path.*chromadb-data" "$workflow" | grep -c "uses: actions/cache/save@v4" || true)
    
    if [[ $has_restore -gt 0 ]]; then
        if [[ $has_save -gt 0 ]]; then
            echo -e "${GREEN}  ✅ Correct pattern: explicit restore + save${NC}"
        else
            echo -e "${YELLOW}  ⚠️  WARNING: $name uses restore but no explicit save${NC}"
            echo "     This might be intentional (read-only), but verify the pattern."
            ((warnings++))
        fi
    fi
}

# Check prepare-chromadb.yml
if [[ -f "$WORKFLOWS_DIR/prepare-chromadb.yml" ]]; then
    check_explicit_pattern "$WORKFLOWS_DIR/prepare-chromadb.yml"
else
    echo "⚠️  prepare-chromadb.yml not found"
fi

echo ""

# Check cache-chromadb.yml
if [[ -f "$WORKFLOWS_DIR/cache-chromadb.yml" ]]; then
    check_explicit_pattern "$WORKFLOWS_DIR/cache-chromadb.yml"
else
    echo "⚠️  cache-chromadb.yml not found"
fi

echo ""
echo "�� Validation Summary:"
echo "  Errors: $errors"
echo "  Warnings: $warnings"

if [[ $errors -gt 0 ]]; then
    echo -e "${RED}❌ Validation failed with $errors error(s)${NC}"
    exit 1
elif [[ $warnings -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  Validation passed with $warnings warning(s)${NC}"
    exit 0
else
    echo -e "${GREEN}✅ All cache handling patterns are consistent${NC}"
    exit 0
fi
