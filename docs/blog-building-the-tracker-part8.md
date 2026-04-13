# Part 8: The Verification Marathon

I woke up on Sunday morning knowing the data wasn't right. Not wrong, exactly. Incomplete. And in journalism, incomplete data presented as complete is a lie by omission.

The trigger was Trump. We had 384 of his roughly 1,500 transactions. The 12 PDFs were too large for single-pass AI parsing — token limits meant we were getting the first few pages of each filing and quietly dropping the rest. The site said "384 transactions" and a user who didn't know better would assume that was the full picture.

It wasn't. And if Trump's data was incomplete, how could I trust anyone else's?

## The $47 Million Error

The data audit started with McMahon. Her Angleton ISD municipal bond — a routine small-town Texas school bond — had been parsed as "Over $50,000,000." The correct range was $1,000,001 to $5,000,000. One field, off by a factor of ten. The kind of error that would make a reporter look like an amateur and a data tool look untrustworthy.

I found it because the numbers didn't pass the smell test. McMahon's total looked inflated. One line item was responsible for nearly all of it. The original PDF clearly showed the correct range. The AI parser had hallucinated a bigger number.

This is why you check. Not "trust but verify" — verify, then trust.

## The Dual-Lane Strategy

I needed a second extraction method that was completely independent of the AI parsing. If two different approaches produce the same data, you can trust it. If they disagree, you know where to look.

The answer was natural-pdf, a Python library by data journalist Jonathan Soma. I'd gone to his sessions at the IRE/NICAR conference in Indianapolis the month before. The library extracts text from PDFs programmatically — no AI, no token limits, no hallucination risk. It handles scanned documents, OCR noise, and multi-page tables without breaking a sweat.

The strategy: extract raw text with natural-pdf, then send each page individually to Claude Opus for structured parsing. Page by page, not PDF by PDF. A 40-page filing becomes 40 small, manageable parsing tasks instead of one impossible one.

## Trump: 384 to 1,315

The first test was Trump's 12 filings. Natural-pdf extracted text from every page. Opus parsed each page into structured transactions. The count jumped from 384 to 963 on the first pass.

But 963 still wasn't right. Some pages had tables that split across page breaks. Others had OCR artifacts — "purehase" instead of "Purchase," "ourchase" with the leading P eaten by a scanner. Opus handled the OCR noise. A second pass with tighter prompting caught the page-break splits.

Final count: 1,315 transactions. 858 filed late. That's a 65% late filing rate for the President of the United States.

The number 384 would have been embarrassing to publish. The number 1,315 tells a story.

## The Dedup Disaster

With more data came more duplicates. The OGE publishes both original and amended filings for the same reporting period. An official files a 278-T, then files an amendment correcting a date or amount. Both PDFs are public. Both get parsed. The same transaction appears twice with slightly different values.

I wrote a deduplication script keyed on (description, date, type) and ran it across all 34 officials. It removed 83 duplicates from 13 officials. Clean.

Except it wasn't. The key was wrong.

A dedup key of (description, date, type) assumes an official can only have one sale of Apple stock on a given day. That's false. An official can sell 500 shares in the morning and 200 shares in the afternoon — same stock, same day, same type, different amounts. Two legitimate transactions.

I'd deleted 34 real trades. The fix was adding amount to the key: (description, date, type, amount). Same stock, same day, same type, same amount range — that's a duplicate. Same stock, same day, same type, different amount — that's two trades.

I restored the 34 from git history. The lesson cost me an hour and zero data, thanks to version control.

## Running the Table

Trump was the proof of concept. Once the natural-pdf pipeline worked, I ran it on all 34 officials in parallel.

Some had clean data already. Bessent's two transactions matched exactly. Lutnick's 197 were all accounted for. These were quick confirmations — the original AI parsing had been accurate.

Others needed work. Criswell jumped from 13 to 80 transactions. Wright had 74 ETF tickers that needed manual resolution — Schwab and Vanguard funds that don't have standard ticker symbols. Miran had 58 well-known public companies (Abbott, Adobe, Arista Networks) with null tickers because the AI parser hadn't extracted them from the parenthetical notation in the PDFs.

Each official got a confidence rating: HIGH for exact match with verification, MEDIUM for minor discrepancies resolved. All 34 reached at least MEDIUM. Most reached HIGH.

Final numbers: 3,283 transactions across 34 officials. Up from 2,320 before verification. The difference — 963 transactions — is almost entirely Trump.

## The ProPublica Cross-Check

ProPublica maintains the most comprehensive executive branch disclosure database. If their numbers disagreed with ours, we had a problem.

They didn't. For 278-T periodic transaction reports — the specific filing type Open Cabinet tracks — our data was actually more complete. ProPublica focuses on the full universe of disclosure types (annual reports, new entrant filings, ethics agreements) across 1,500+ appointees. We focus narrowly on stock trades for the 34 most senior officials, and we go deeper.

The cross-check confirmed what the dual-lane verification had already shown: the data was solid.

## The Copy Pass

Data accuracy is half the job. The other half is not saying anything stupid.

I ran four audits in parallel before deploying: a copy review against SPJ ethics standards and AP style, a security scan for exposed credentials, a visual audit of every page on mobile, and one more ProPublica cross-reference.

The copy review found nine issues. "Opus-verified" was jargon that leaked from internal pipeline labels into user-facing summaries. "1 sales" appeared on two official pages — plural where singular was needed. The README said "$2.9B estimated value" but the actual calculation showed $2.7B. The About page said "Last updated" followed by a dynamic `new Date()` that would always show today's date instead of the actual last update.

The security scan found nothing exposed. The visual audit caught a "Former" badge concatenating with the title ("FormerAdministrator" instead of "Former Administrator") and a Tailwind class (`sm:truncate-none`) that doesn't exist in version 4.

All fixed. All deployed.

## The Email

At 1:20 PM on April 13, I sent the email to the Texas Tribune. Two links: the live site and the GitHub repository. A short pitch connecting the tool to the gap in executive branch accountability coverage. No overselling. The work speaks for itself.

The site had 34 officials, 3,283 verified transactions, 1,217 late filings, D3 visualizations, company reverse-lookup, a late filings accountability page, an automated weekly pipeline, full AI transparency, source PDFs linked from every official's page, and a methodology section that would satisfy any editor's questions about where the data came from.

Twenty-seven commits that day. Every one of them made the data more trustworthy.

## What I Learned

The McMahon error taught me that AI parsing needs verification, not trust. The dedup disaster taught me that cleanup scripts can destroy good data as easily as bad. The Trump gap taught me that incomplete data presented completely is worse than no data at all.

The verification marathon wasn't glamorous. It was twelve hours of cross-referencing numbers, restoring deleted rows, resolving ticker symbols, and reading PDFs to confirm what a machine told me was true. It was exactly the kind of work I did for six years at Oklahoma Watch — checking the data until you're certain, then checking it again.

The tool is a developer artifact. The verification is the journalism.
