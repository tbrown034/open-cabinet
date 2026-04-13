# Full Audit — Run All Checks

Run the complete quality assurance suite for Open Cabinet. This is the pre-publication check.

## Run these in order:

### 1. Security Scan
Run the checks from `.claude/commands/security-scan.md` — no secrets exposed, .gitignore correct, API routes authenticated.

### 2. Copy Review
Run the checks from `.claude/commands/copy-review.md` — AP style, SPJ ethics, citations linked, no jargon.

### 3. Anomaly Check
Run the checks from `.claude/commands/anomaly-check.md` — data quality, parsing errors, compliance flags.

### 4. Build Check
Run `pnpm run build` and verify zero errors.

### 5. Validation Suite
Run `pnpm run validate` and verify PASS.

### 6. Visual Spot Check
Navigate to these pages on localhost and verify they render correctly:
- `/` (landing)
- `/all` (swim lane)
- `/companies` (search)
- `/late-filings` (accountability)
- `/about` (scrollytelling + feedback form)
- `/officials/trump-donald-j` (detail page)
- `/admin` (dashboard)

### 7. Mobile Check
Resize to 375px width and check landing page and one official detail page.

## Final Report

```
=== OPEN CABINET FULL AUDIT ===
Security:    PASS/FAIL
Copy:        READY/NEEDS WORK/NOT READY
Data:        X anomalies (Y critical)
Build:       PASS/FAIL
Validation:  PASS/FAIL
Visual:      PASS/FAIL
Mobile:      PASS/FAIL

Overall:     READY FOR PUBLICATION / NOT READY
```
