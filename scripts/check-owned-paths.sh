#!/usr/bin/env bash
# usage: bash scripts/check-owned-paths.sh A|B|C|D
me="$1"
[ -z "$me" ] && { echo "usage: $0 A|B|C|D"; exit 1; }
owner_of() {
  case "$1" in
    backend/src/modules/catalog/*|backend/scripts/seed-catalog.js|frontend/src/pages/catalog/*|supabase/migrations/01*|docs/member-b/*) echo B;;
    backend/src/modules/subscriptions/*|backend/src/modules/billing/*|backend/src/jobs/billing.job.js|backend/src/jobs/autoclose.job.js|frontend/src/pages/subscriptions/*|supabase/migrations/02*|docs/member-c/*) echo C;;
    backend/src/modules/invoices/*|backend/src/modules/payments/*|backend/src/modules/reports/*|backend/scripts/seed-bulk.js|frontend/src/pages/invoices/*|frontend/src/pages/payments/*|frontend/src/pages/reports/*|supabase/migrations/03*|docs/member-d/*) echo D;;
    *) echo A;;
  esac
}
bad=0
for f in $(git diff --name-only origin/main...HEAD); do
  o=$(owner_of "$f")
  if [ "$o" != "$me" ]; then echo "NOT YOURS ($o owns): $f"; bad=1; fi
done
[ $bad -eq 0 ] && echo "OK: all changed files are owned by $me" || { echo "Fix before pushing."; exit 1; }

