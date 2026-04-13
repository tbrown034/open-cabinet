# Security Scan — Secrets and Exposure Check

Scan the entire codebase for accidentally exposed secrets, credentials or sensitive data.

## Checks

### 1. Hardcoded secrets
Search ALL files (except node_modules, .next, .git) for:
- API keys: patterns like `sk-ant-`, `sk-proj-`, `re_`, `pk_`, `Bearer `
- Database URLs: `postgresql://`, `postgres://`, connection strings
- Tokens: `ghp_`, `gho_`, `github_pat_`, JWT tokens
- Secrets: `secret`, `password`, `credential` in non-example files

### 2. Git history
Run `git log --all --diff-filter=A -- '*.env' '*.env.*' '*secret*' '*credential*'` to check if secrets were ever committed.

### 3. .gitignore coverage
Verify these patterns are gitignored:
- `.env*` (with `!.env.example` exception)
- `sqlite.db`
- `node_modules/`
- `.next/`

### 4. Client-side exposure
Check all files in `app/` for:
- `process.env.` references without `NEXT_PUBLIC_` prefix in client components
- API keys passed as props to client components
- Secrets in `console.log` statements

### 5. API route security
Check all routes in `app/api/` for:
- Auth checks (admin routes must verify session)
- Rate limiting on public endpoints
- CRON_SECRET verification on cron routes

## Output
Report: SECURE or list every finding with file, line and severity (critical/warning/info).
