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
   the sentence to call its counts checked and forbids the words that turn a
   count into a claim about the whole record. A sentence that fails either
   check is thrown away and replaced by one assembled in code.

## Tracked is not the same as checked

Most rows on the site have not cleared a check, so a question about a real
official often has no checked answer. The first live run answered "Trump is
not among the officials listed in this dataset." He is the largest official on
it, with 8,940 rows, none of them checked at the time.

Two things fixed that. The roster shown to the planner is the whole officials
index, so every tracked name resolves. And when a query matches no checked
row, the same filters run again over the pending rows, and the response says
what is waiting:

> Donald J. Trump is tracked here. The 4,389 rows matching this query are still
> being checked, 564 under review and 3,825 not yet checked. There is no
> checked answer yet.

Every `not_in_data` response carries `pendingMatches` with those two counts.
The box never says a person is absent unless the name resolves to nobody in
the index.

## What "checked" means, and why the word matters

`lib/published-rows.ts` is the only source the executor reads. A row qualifies
when it is **checked**, which here means exactly what it means in the site's
tables and on the methodology page: score 3. An independent program or a second
company's model agreed with the row and a third company's model confirmed it
against the page image, or a person compared it to the filing.

It used to mean score 2 or better, and the box called that "verified." Grok
caught it on Sept. 6 and was right. A reporter who had read a table on this
site would hear a stronger claim than the code was making, and the methodology
page said 201 rows had passed every check while the box implied 1,495 had. One
word, one meaning, or the contradiction rides on every answer.

**A caveat on the coverage number.** Checked rows are a small share of the
record and the share moves as the audit runs, so the figure is computed from
the verification file on every request and never written into copy. At the time
of writing it is 136 of 11,294 parsed rows for the current roster. That is not
a comfortable number to print. It is the honest one, and it appears in the
first line a reader sees, because a box that hid it would be worse than a box
that has it.

Every answer also carries what it left out, twice: the rows matching that
question that have not cleared a check, broken into under review, awaiting the
page audit and not yet compared; and the same three counts site-wide. The
per-question line exists because a site-wide figure tells a reader nothing
about the question they asked.

## What the AI is allowed to do

- Choose filters: officials, symbols, a description substring, transaction
  types, a date range, late-only, and a dollar floor or ceiling.
- Choose one aggregate from a fixed list of eight.
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
  or "most recent", or drop the word "checked" from a count. The word
  "verified" is itself refused, because it named a weaker bar than the rest of
  the site means by it.
- Use a dash. Em and en dashes are stripped from any model text that reaches
  the response.
- Widen a query. On an official's page the plan is pre-filtered to that slug
  after validation, so the model cannot reach past the person whose page it is.
- Say a number the executor did not produce, in digits or spelled out. "Three
  officials", "one billion" and "hundreds of" are checked the same as digits.
- Say a date the result does not carry.
- Say a person is not tracked. Only the resolver, which holds the roster, makes
  an absence claim. When the model declines because it could not place a name,
  the route rescans the question against the roster before that reaches
  anyone. Declines about anything else stand: an average is still unsupported
  for someone the site does track.
- Approximate. If any part of a question cannot be represented in the plan, the
  model declines rather than dropping the part it cannot express.

## The numbers check

The executor returns two extra lists beside the data: every raw figure, and
every preformatted way the site would print it. `$4,512,300`, `$4.5M` and
`$4.5 million` are all in that list when the executor computed them. The check
reduces both the sentence and the list to comparable values, so a rounding
passes only when the code did the rounding.

A figure the code never produced fails. So does a share, a percentage or a
comparison the query never asked for. On a failure the response still answers
the question; it just answers in a sentence built by `templateAnswer`.

## The refusals are code now

Every rule below used to live in the planner prompt, which is a request. Grok's
Sept. 6 review found four questions that walked straight through it and came
back as confident answers to something else. `lib/ask/intent.ts` now classifies
the question before a token is spent:

| Question shape | What happens |
| --- | --- |
| average, mean, median, typical, per trade | Declines. A filing discloses a range, so there is no figure to average. |
| a share of anything but lateness | Declines. Only late filings have a denominator this box can name. |
| a share of late filings | Forces the `late_share` aggregate, whatever the model chose. |
| except, excluding, but not, other than, neither | Declines. Every filter is membership; none is subtraction. |
| both X and Y across assets | Declines. Filters are OR within a field, never AND. |
| largest, biggest, most expensive, highest value | Forces an amount sort, so date order cannot pass for size. |

The gate is deliberately over-eager. Refusing a question the box could have
answered costs a reader one rephrase. Answering a question nobody asked costs
them a wrong fact with a citation under it.

The rescue path is gone too. A model decline used to be convertible into a
count of a different question, which is how "Average trade size for Doug
Burgum" shipped as a headcount. A decline is a decline. The one thing still
re-checked is the claim the model may not make, that a person is not tracked,
and the most a roster rescan can produce is a pending answer about that person.

## Answering a different question is the failure that matters

The second round of adversarial testing found one failure repeated in five
shapes. The plan could not express the question, so the box quietly answered a
narrower one and looked confident doing it.

| Asked | Was answered as |
| --- | --- |
| What percentage were late | A plain count |
| Average trade size | A sum |
| Compare two officials | One official |
| What did he buy last week | No date filter at all |
| Between $250K and $500K | Only the floor |

Each fix is structural, not a nicer prompt. There is now a `late_share`
aggregate that computes the share in code and hands the phraser a finished
string. There is an `amountAtMost` filter, and the plain-English restatement
prints both bounds so a dropped one is visible. The planner is given today's
date and told to turn relative periods into explicit ones. Averages and medians
decline with a reason: a filing discloses a range, so there is no figure to
average. A comparison becomes one ranking with every named official in it, and
the answer names anyone who turned out to have nothing.

Above all of it, one instruction the planner is given before any other: if any
part of the question cannot be represented, do not approximate, decline.

## What a review found in the check itself

Codex reviewed this feature on Sept. 6 and found the numbers check was looser
than it read. Three holes, all of the same shape: a token that looked like a
figure was matched against something that was not one.

- **Dates were being split into digits.** A result carrying Oct. 21, 2025
  vouched for 2025, 10 and 21, so "10 checked rows shown" passed on a result
  that listed one. Dates are now matched whole, against the whole dates the
  result carries, and removed before anything counts numbers.
- **Compact money lost its suffix.** "$4.5M" tokenized as "$4.5", which meant
  a sentence could say "$4.5" or "$4.5B" and pass. K, M and B are part of the
  token now.
- **Spelled-out quantities carried no digits at all.** "One billion checked
  trades" had nothing for the tokenizer to catch. Every quantity word from one
  to ninety, plus hundred, thousand, million, billion and dozen, is now checked
  against the result. "Half", "twice" and "double" name no value, so they only
  pass if the executor wrote them, which it never does.

The rest were about the endpoint. The origin gate for this route no longer
trusts every `*.vercel.app` host, because a paid endpoint any Vercel tenant can
call is a budget anyone can spend; it takes the production hosts plus whatever
`ALLOWED_ORIGINS` names, and localhost only outside production. Client identity
for the per-IP throttle comes from the platform's own forwarded header, and
where it has to read `X-Forwarded-For` it takes the last hop rather than the
first, since everything left of it is whatever the caller claimed. A rejected
request is no longer recorded, so hammering a 429 cannot grow the limiter. A
phrasing call that fails or hangs no longer discards an answer the code has
already computed; it falls back to the template on a ten-second deadline.

The daily cap is now durable. It lives in one row per UTC day in `ask_quota`
and is reserved by a single atomic upsert before either model call, so the
spend cannot outrun it and a restart cannot replenish it. Apply
`drizzle/0003_ask_quota.sql` before deploying: until that table exists the
route falls back to a per-instance counter and says so in the logs.

Two findings turned on the same mistake in the other direction. Symbol
resolution ran against checked symbols only, so a question about a stock that
appears solely in unchecked rows died at the resolver instead of reaching the
pending count; it now resolves against every symbol the site holds. And rows
were loaded through the same helper the homepage uses, which drops
prior-administration holdovers, so a holdover resolved by name and then
reported nothing, which reads as "this person traded nothing." Their rows are
loaded now, and the restatement marks them former.

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
well under a dollar a day. Live runs answer in about three seconds. The model is set by `ASK_MODEL` and defaults to
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

**What stops it answering from rows you have not checked?**
The executor cannot reach them. `getPublishedRows()` filters on verification
state before any plan runs, so an unchecked row is not in the array the query
touches.

**What if the question is one your query language cannot express?**
It declines and says which kind of thing it cannot do. That is the rule the
planner is given first, because the alternative is worse than a refusal: a
confident answer to a question nobody asked.

**What about an official the site tracks but keeps out of its totals?**
Prior-administration holdovers resolve by name and then get told they are out
of scope, with a pointer to their page. Reporting zero for them would read as
"this person traded nothing," which is a different and false statement.

**What if it picks the wrong person?**
The resolver only accepts an exact slug, an exact full name, or a last name
held by exactly one official. Two Smiths return `not_in_data` with both names,
and the reader picks.

**Why is the number so small?**
Because "checked" is a real bar and most rows have not cleared it. The box
could answer from ten times as many rows by lowering the word to mean "a
program agreed, audit pending." It used to. That is the change this feature
most needed and the one a reader would never have caught.

**What does it get wrong?**
Coverage, mostly. Most rows are still one model's read, so a question about the
full record gets an answer about a slice of it. Live testing caught the box
saying "all 41 disclosed sale transactions" when it meant 41 checked ones, and
telling a reader Trump was not in a dataset he is the largest official in. A
code review then caught the numbers check itself passing figures it should
have refused. All of it is now blocked in code rather than asked for in a
prompt. That is the pattern, and it is the honest summary of building this:
every guarantee that survived was one a program enforced. Every rule that only
lived in a prompt eventually broke.

**Would you publish this?**
As it stands, next to the excluded counts, yes. Without them, no.
