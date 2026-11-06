#!/usr/bin/env bash
# Copia el motor a las Edge Functions (el empaquetador de Supabase solo incluye supabase/functions/**).
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf supabase/functions/_shared/engine
mkdir -p supabase/functions/_shared/engine
cp engine/src/*.ts supabase/functions/_shared/engine/
echo "Motor sincronizado → supabase/functions/_shared/engine"
