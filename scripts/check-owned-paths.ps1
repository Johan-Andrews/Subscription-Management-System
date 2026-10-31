param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("A", "B", "C", "D")]
    [string]$Me
)

function Get-OwnerOf($path) {
    if ($path -like "backend/src/modules/catalog/*" -or $path -like "backend/scripts/seed-catalog.js" -or $path -like "frontend/src/pages/catalog/*" -or $path -like "supabase/migrations/01*" -or $path -like "docs/member-b/*") { return "B" }
    if ($path -like "backend/src/modules/subscriptions/*" -or $path -like "backend/src/modules/billing/*" -or $path -like "backend/src/jobs/billing.job.js" -or $path -like "backend/src/jobs/autoclose.job.js" -or $path -like "frontend/src/pages/subscriptions/*" -or $path -like "supabase/migrations/02*" -or $path -like "docs/member-c/*") { return "C" }
    if ($path -like "backend/src/modules/invoices/*" -or $path -like "backend/src/modules/payments/*" -or $path -like "backend/src/modules/reports/*" -or $path -like "backend/scripts/seed-bulk.js" -or $path -like "frontend/src/pages/invoices/*" -or $path -like "frontend/src/pages/payments/*" -or $path -like "frontend/src/pages/reports/*" -or $path -like "supabase/migrations/03*" -or $path -like "docs/member-d/*") { return "D" }
    return "A"
}

$diffFiles = git diff --name-only origin/main...HEAD
$bad = 0
foreach ($f in $diffFiles) {
    if ([string]::IsNullOrWhiteSpace($f)) { continue }
    $o = Get-OwnerOf $f
    if ($o -ne $Me) {
        Write-Host "NOT YOURS ($o owns): $f"
        $bad = 1
    }
}

if ($bad -eq 0) {
    Write-Host "OK: all changed files are owned by $Me"
} else {
    Write-Host "Fix before pushing."
    exit 1
}

