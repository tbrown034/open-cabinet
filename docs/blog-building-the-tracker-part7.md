# Part 7: Building the Machine That Watches

Parts 1 through 6 were about getting the data right. This one is about keeping it right.

## The Problem With Static Data

Open Cabinet launched with 34 officials and 2,320 transactions, all parsed from PDFs during marathon build sessions. The data was accurate. It was also frozen. Every time an official filed a new 278-T, the site got a little more stale. A journalism tool that doesn't update isn't journalism — it's a snapshot.

The OGE publishes new filings at an irregular pace. Some weeks, nothing. Some weeks, a dozen. There's no RSS feed, no webhook, no notification system. You have to check. So I built a machine that checks.

## Four Sessions, One Pipeline

I planned the pipeline as four discrete sessions, each with its own commit-and-push cycle. If anything broke, I could roll back to the last working state without losing everything else.

**Session A: Database.** The site was reading from JSON files — static, fast, but impossible to update incrementally. I added five tables to the existing Neon PostgreSQL instance (officials, transactions, news_coverage, pipeline_runs, validation_results) alongside the four auth tables that were already there.

The trickiest part was avoiding a conflict with Better Auth's existing tables. Drizzle ORM had never generated migrations for this project — the auth tables were created by Better Auth directly. Running `drizzle-kit generate` for the first time would have tried to CREATE tables that already existed. The fix: `drizzle-kit pull` first, which introspects the live database and creates a baseline snapshot. Then `generate` only produces SQL for the new tables.

Seeded 34 officials and 2,282 transactions. The count is 38 fewer than the JSON files because the UNIQUE constraint on (officialId, description, date, amount, type) caught duplicate transactions from amended filings. The database is cleaner than the source data. That's the point.

**Session B: Parser.** This is where Claude earns its keep. Each 278-T PDF gets base64-encoded and sent to Claude Sonnet with a precise extraction prompt. The prompt specifies exact output format, valid amount ranges, valid transaction types, and asks for a confidence score on each extraction.

The first test — Bessent's filing, 2 transactions — came back perfect. $0.02 cost. The second — Bisignano, 14 transactions — also clean. $0.01.

Then I added OpenAI as a cross-provider verification system. The same PDF goes to Claude Sonnet and GPT-5.4-mini independently. If both models extract the same data, confidence is high. On the Bessent test: 100% field-level agreement, 10 out of 10 fields match, $0.025 total cost for parse plus verify.

Two different companies. Two different architectures. Same answer. That's the kind of verification that matters when your career is riding on the accuracy.

**Session C: Orchestrator.** The pipeline script chains everything: poll the OGE API (16,000+ records, paginated with 2-second delays), filter for Level I/II officials with 278-T filings, diff against known filings, download new PDFs, parse each one, validate, insert into the database with ON CONFLICT deduplication. Failed parses don't block the run — they're logged and the pipeline continues.

Every run creates a record in the pipeline_runs table: timestamp, status, new filings found, transactions parsed, token usage, cost, duration, and any errors. This is the audit trail.

**Session D: Admin and scheduling.** A GitHub Actions workflow runs the pipeline weekly (Monday 6 AM ET). Filings come in at a pace of 1-2 per week — daily was overkill and burned credits on empty checks. Manual triggers are available from the GitHub Actions UI or locally with `pnpm run pipeline`.

The admin dashboard (OAuth-protected, Google sign-in, whitelisted to my email) shows live database stats, pipeline run history with costs, a review queue for low-confidence parses, a data validation button, and quick links to both API consoles.

## The Cost Math

I have $25 in Anthropic credits and $40 in OpenAI credits. Here's what that buys:

Sonnet parses a typical PDF for $0.02. At 1-2 new filings per week, that's about $0.16/month. Cross-provider verification doubles it to $0.32/month. A full re-parse of all 629 filings in the OGE system would cost about $12.50 with Sonnet, or $6.25 using the Batch API at 50% discount.

The admin dashboard tracks cumulative pipeline cost. Right now it shows $0.00 because the only completed run was a test. By month two, I'll have real numbers.

For context: the tool exists to help land an $80,000 journalism job. Spending $2/month on data accuracy is not where I'm going to cut corners.

## The Model Menu

I built model selection into the parser because different PDFs need different things:

- **Claude Sonnet** (default): Best accuracy-to-cost ratio. Handles messy OCR.
- **Claude Haiku**: Half the cost, fine for clean filings. Good for bulk re-parse via Batch API.
- **Claude Opus**: Highest accuracy. Reserved for verification of complex filings.
- **GPT-5.4-mini**: Cross-provider check. When Anthropic and OpenAI agree, the data is solid.
- **GPT-5.4-nano**: $0.003 per PDF. Cheapest possible fallback if credits run low.

The admin page shows all five models with their pricing. In a future version, the admin UI will let you pick the model per-parse.

## The Accountability Page

While building the pipeline, I realized the late filing data tells a story that deserves its own page. So I built `/late-filings`.

The numbers: 563 late filings across 12 officials. 24.3% of all transactions were filed past the 30-day deadline. Troy Edgar filed 100% of his 63 transactions late. Linda McMahon: 98%. Douglas Burgum: 83%. Trump: 55%.

The page contextualizes this with the enforcement reality: a $200 fee, routinely waived. No criminal prosecution has ever been brought under the STOCK Act. It links to the About page's methodology section and the research briefs.

This is the page a Tribune editor opens and thinks: "This person understands what data journalism is for."

## What's Not Done

The site still reads from JSON at build time. The database is seeded and ready, but the frontend hasn't switched to DB queries yet. This is intentional — the plan says to keep JSON as the build cache so the site deploys without a database dependency. The pipeline writes to the DB, and a future step will regenerate JSON from the DB after each run.

The GitHub Actions workflow needs repository secrets configured (ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL, DATABASE_URL_UNPOOLED) before it can run. That's a settings change, not a code change.

The news search is still manual. The `check-news` script is a placeholder that documents the workflow — real automation would need a web search API or a Claude Code scheduled agent.

Form 201 requests for the 248 officials behind the paywall (Oz, Pirro, Loeffler, Patel, Makary) haven't been filed yet. Each one takes 2-5 business days. That's the next data expansion.

## The Machine

The pipeline is a machine. Not in the Silicon Valley sense of "machine learning" — in the newsroom sense of a system that does the same reliable thing every week without someone remembering to do it.

Check OGE. Download what's new. Parse it. Validate it. Store it. Log what happened. If something fails, say so.

The journalism is in what you build on top of the data. The machine just makes sure the data is there.
