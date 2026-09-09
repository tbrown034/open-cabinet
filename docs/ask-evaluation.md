# How we evaluate Ask

Ask translates a question into a restricted query. Application code runs that query over the published records and writes the answer. Testing therefore asks two separate questions: did the query preserve the reader's meaning, and did the calculation match the selected records?

## September 8, 2026: 100 questions in 10 rounds

The first attempts met their expected outcome in 96 of 100 cases across an iterative run. After fixing three misleading answers and rerunning the affected rounds, 99 met expectations. One false refusal remains. This is a selected regression set, not a population accuracy estimate.

| Category | Final cases meeting expectation |
|---|---:|
| Instruction attacks | 10 / 10 |
| Stock tips and unsupported advice | 10 / 10 |
| Bot-like and unrelated input | 10 / 10 |
| People and titles | 10 / 10 |
| Company names and symbols | 10 / 10 |
| Dates and time ranges | 10 / 10 |
| Counts and disclosed value | 10 / 10 |
| Sparse and missing data | 9 / 10 |
| Unsupported comparisons | 10 / 10 |
| Everyday wording | 10 / 10 |

### What the run found

- Two questions asked when Lutnick disclosed or reported transactions. Ask silently treated those as transaction dates. The filing-date rule now recognizes present-tense wording and explains the supported alternative. An older golden case that accepted “report in 2025” was corrected; “make in 2025” remains supported.
- “Tell me how many trades involve GOOG” returned 45 because the application expanded GOOG to its sibling GOOGL. An explicit ticker now skips automatic issuer-wide expansion. The corrected result is 20; company-wide Alphabet questions still include both classes. Cache contract v3 excludes earlier expanded translations.
- “Count purchases of Imaginary Moon Cheese Holdings” was refused as an ownership question. The broad Holdings keyword rule can mistake company names for portfolio questions. This remains a documented false refusal, not a passing case. Fixing it should cover real issuer names and preserve refusals of actual ownership questions; do not add an exception for this invented company alone.
- Some hostile prompts containing “return” receive the profit-related refusal because that word matches the financial-return rule. They do not receive an answer or execute an action, so they meet the safety-outcome criterion; the explanation could be more relevant. The score does not certify every refusal's wording quality.

### Method and limits

Each round had 10 new question wordings, with no exact duplicates from the earlier 120-case set. Expected filters and result shapes were specified before the corresponding round. Three questions using “disclose/report in 2025” were deliberately assigned a refusal expectation before their rounds, because filing dates are not the supported date filter.

The local application POST handler ran with real Anthropic and Neon access in isolated processes, retaining authentication, origin checks and the durable daily spending cap. Each round started a new process; this did not test a sustained production throttle. No production limits, configuration, schema, subscriber data or canonical filing records were changed. Operational question logs and quota reservations were written. A separate earlier run tested 50 questions through the actual live browser.

Independent predicates compared the expected and actual selected row IDs, counts, groups and late shares. Separate arithmetic recomputed range estimates and month counts. No arithmetic mismatches were found. Range estimates use the site's stated midpoint/open-ended convention; they are not exact trade values or profits. PDF extraction accuracy was not re-audited.

Rounds 4 and 10 were rerun after their fixes, adding 20 requests to the 100 initial requests. Some retests reused validated translations; this is not 120 fresh model generations. Different rounds used the code as it evolved, and unaffected cases were not all rerun under the final cache contract. Automated regressions cover the new guards, exact ticker scope and company-wide expansion.

Instruction and bot-like cases exercised question handling. They were not a penetration test, traffic flood, authentication audit or proof of bot resistance. The evaluator did not issue SQL or execute the commands contained in those question strings. Exact provider cost was not captured; request counts cannot establish a dollar charge.

## Where the evidence lives

- `data/evaluations/ask-2026-09-08-results.json`: all 100 questions, predefined expectations, first and latest answers/plans, and reviewed outcomes. These are synthetic test questions, not copied private user history.
- `data/evaluations/ask-latest.json`: dated summary and selected examples rendered by `/admin/askai`.
- `data/golden/ask-questions.golden.json`, `lib/ask/intent.test.ts`, and `app/api/ask/route.test.ts`: repeatable tests that do not call the model.
- Private local working evidence: `docs/ask-100-review-raw-2026-09-08.json`, including full computed results; `docs/ask-live-review-2026-09-08.md` records the separate live release check.

The administrative question history is an operational log. “Answered” means a response was produced, not that it was independently correct. Reader feedback is not a test verdict. Older versions and synthetic development tests share that history; it does not currently label every request's environment or store exact answer text. Rejections before processing, such as rate limits, may not be logged. The review screen explains these limits and paginates through the stored records.

## Future rounds

Choose cases to probe an uncovered behavior or a reported failure. Define the intended filters or acceptable refusal before running them, save the actual answer and query, and review the differences. Keep the first failed attempt even after a fix. Use a new dated results file; only update `ask-latest.json` after reviewing the whole run. Preserve failures rather than relabeling them to improve a score.

`scripts/ask-batch.ts` can send a text file of one question per line to a local server and save responses. It makes real calls when the server is configured with provider credentials. It does not independently grade those responses. Automated checks use `pnpm test`; no provider credentials are needed for those.

For a demonstration, show a useful answer, its “Interpreted as” line, the admin log entry, then an honest refusal. The evaluation section explains why the system is worth trusting within its stated limits without claiming it understands every question.
