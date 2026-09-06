# Ask the data

A box on the homepage and on every official's page takes a question in plain
English and answers it from Open Cabinet's disclosure rows.

The design constraint is the whole feature: the AI never computes a number, and
it never sees a row that something other than the first model has agreed with.

## The five steps

1. **Plan.** One model call. The model gets the field names, the list of
   official names and nothing else. It returns a query plan through a tool
   called `emit_plan`, or it calls `decline`. It sees no trade rows.
2. **Validate.** `lib/ask/plan.ts` checks the plan field by field. An unknown
   key, a bad date, a limit above 25 or a transaction type that does not exist
   ends the request. Then the resolver turns the names the model wrote into
   slugs that exist. An ambiguous name is refused with the people it could
   have meant. A question with no filters at all is turned from a list into a
   count, so a bare "trades" cannot be narrated as though the top of the array
   were a finding.
3. **Execute.** `lib/ask/execute.ts` filters and counts. It is ordinary code
   over the same amount catalog the rest of the site uses, so an answer and the
   page a reader can open agree by construction.
4. **Phrase.** A second model call. It receives the result JSON and the
   plain-English restatement of the query, and nothing else. It writes at most
   two sentences.
5. **Check.** `lib/ask/check.ts` pulls every number out of that sentence and
   requires each one to match a figure the executor produced. It also requires
   the sentence to call its counts verified and forbids the words that turn a
   count into a claim about the whole record. A sentence that fails either
   check is thrown away and replaced by one assembled in code.

## Tracked is not the same as verified

Most rows on the site have not cleared a check, so a question about a real
official often has no verified answer. The first live run answered "Trump is
not among the officials listed in this dataset." He is the largest official on
it, with 8,940 rows, none of them verified at the time.

Two things fixed that. The roster shown to the planner is the whole officials
index, so every tracked name resolves. And when a query matches no verified
row, the same filters run again over the pending rows, and the response says
what is waiting:

> Donald J. Trump is tracked here. The 4,389 rows matching this query are still
> being checked, 564 under review and 3,825 not yet checked. There is no
> verified answer yet.

Every `not_in_data` response carries `pendingMatches` with those two counts.
The box never says a person is absent unless the name resolves to nobody in
the index.

## What the rows are

`lib/published-rows.ts` is the only source the executor reads. A row qualifies
when its verification score is 2 or better and its state is not "disputed" —
an independent program read the same values, a second company's model read the
same values, a page audit confirmed it, or a person did.

Of 11,501 parsed rows as of Sept. 6, 2026, that is 1,364. Every answer carries
the count of what it left out: 1,268 rows under review and 8,662 not yet
independently checked. A reader sees the size of the gap in the same breath as
the number.

## What the AI is allowed to do

- Choose filters: officials, symbols, a description substring, transaction
  types, a date range, late-only, a dollar floor.
- Choose one aggregate from a fixed list of seven.
- Decline.
- Write two sentences about a result it is shown.

## What it is not allowed to do

- Compute, count, sum, rank or estimate anything.
- See a row before the plan runs.
- Name an official the resolver cannot match to a slug.
- Emit a field the validator does not recognize.
- Write its own refusal. A decline returns a category from a fixed list and the
  site writes the sentence, because the model's own refusals used em dashes and
  read like a chatbot.
- Say all, every, total, on file, complete, entire, "disclosure records show"
  or "most recent", or drop the word "verified" from a count.
- Use a dash. Em and en dashes are stripped from any model text that reaches
  the response.
- Widen a query. On an official's page the plan is pre-filtered to that slug
  after validation, so the model cannot reach past the person whose page it is.
- Say a number the executor did not produce.

## The numbers check

The executor returns two extra lists beside the data: every raw figure, and
every preformatted way the site would print it. `$4,512,300`, `$4.5M` and
`$4.5 million` are all in that list when the executor computed them. The check
reduces both the sentence and the list to comparable values, so a rounding
passes only when the code did the rounding.

A figure the code never produced fails. So does a share, a percentage or a
comparison the query never asked for. On a failure the response still answers
the question; it just answers in a sentence built by `templateAnswer`.

## Rate limits and cost

Thirty questions per hour per hashed IP, and 300 per day across the site. Both
counters live in memory, which means they reset on redeploy and are per
serverless instance. That is deliberate for now: the ceiling they protect is
small, and a durable limiter would put a database round trip in front of every
question. Move them to the existing Neon instance if the box ever sees real
traffic.

Two model calls per question. The plan call sends a short system prompt plus
the roster of names, and the phrase call sends one result payload. At Sonnet
pricing that is roughly a tenth of a cent per question, so the daily cap is
well under a dollar a day. The model is set by `ASK_MODEL` and defaults to
`claude-sonnet-5`.

Every question is logged as one JSON line to `data/meta/ask-log.jsonl` when the
filesystem is writable, and to the console when it is not. The line records the
question, the plan, the row count, whether the model's sentence survived the
check, and any figures it was rejected for.

## Questions a reader would ask

**Where does the AI actually sit?**
At the two ends. It turns English into a query, and it turns a result into a
sentence. Everything between those two points is code.

**How do you know it did not make a number up?**
Because a number it makes up does not appear in the result payload, and the
check drops the sentence. The fallback sentence is assembled from the same
result, so the reader still gets an answer.

**What stops it answering from rows you have not verified?**
The executor cannot reach them. `getPublishedRows()` filters on verification
state before any plan runs, so an unverified row is not in the array the query
touches.

**What if it picks the wrong person?**
The resolver only accepts an exact slug, an exact full name, or a last name
held by exactly one official. Two Smiths return `not_in_data` with both names,
and the reader picks.

**What does it get wrong?**
Coverage, mostly. Most rows are still one model's read, so a question about the
full record gets an answer about a slice of it. Live testing caught the box
saying "all 41 disclosed sale transactions" when it meant 41 verified ones, and
telling a reader Trump was not in a dataset he is the largest official in. Both
are now blocked in code rather than asked for in a prompt. That is the pattern:
a prompt is a request, a check is a guarantee.

**Would you publish this?**
As it stands, next to the excluded counts, yes. Without them, no.
