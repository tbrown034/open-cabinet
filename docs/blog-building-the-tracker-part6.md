# Part 6: The Polish Pass and the Research Vault

Twenty-four hours after building the MVP, I came back for what I expected to be a quick polish pass. Fix some mobile layouts, tweak the footer, maybe swap a font. Four hours later I had rebuilt the About page twice, fact-checked every claim on the site against federal law, compiled 180 pages of research briefs, expanded from 29 officials to 34, and had a crisis of confidence about a Google Font.

## The Font Problem

A previous review session flagged something I'd been ignoring: Instrument Serif is becoming an AI tell. It's the single most popular "make it look editorial" Google Font in AI-generated projects. Anyone reviewing portfolios in the data journalism space has seen it dozens of times. It's not bad. It's just becoming the typographic equivalent of "I asked Claude to build me a website."

The fix was Source Serif 4 — Adobe's open-source editorial serif. Used by actual publications. Available on Google Fonts. Heavier than Instrument Serif, more institutional weight. The swap touched 12 files. The site immediately looked less like a template and more like a newsroom built it.

Real newsrooms use fonts with institutional weight. ProPublica has a custom serif. The Texas Tribune uses Open Sans Bold for headlines and PT Serif for body. The Marshall Project uses Knockout. Nobody in a real newsroom is browsing Google Fonts trending page.

## The Fact-Check

I'd written a lot of explainer copy the night before at 1 AM. Some of it was wrong.

The biggest error: I'd written that "trading in conflicting sectors is a potential criminal violation under 18 U.S.C. Section 208." That's not what Section 208 does. It prohibits participating personally and substantially in a government matter affecting your financial interests. Trading stocks isn't the crime. Taking official action while you hold those stocks is the crime. The distinction matters. I was conflating two different legal frameworks — the STOCK Act (disclosure timing) and Section 208 (conflict of interest) — in a way that would embarrass me in front of any ethics lawyer.

Other fixes: the 30-day filing deadline is only half the story (there's a 45-day hard backstop). "Every stock trade" overstates the requirement (mutual funds and ETFs are exempt — that's the biggest loophole in the STOCK Act). The $200 penalty is a "fee," not a "fine." Congress didn't "write the rules in 2012" — the Ethics in Government Act dates to 1978.

Nine corrections total. Every one of them was something I'd have caught in an editing pass at Oklahoma Watch. The lesson: AI can write fast copy. You still need an editor.

## The Research Vault

This is the part I'm most proud of, and it doesn't appear anywhere on the site.

I deployed six research agents in parallel to build an internal knowledge base — everything there is to know about executive branch financial disclosures. Each agent had a specific brief: the STOCK Act and federal ethics law, case law and legal precedent, OGE structure and data, late filing patterns, the divestiture process, and news coverage.

They came back with 180+ pages of sourced research. Every factual claim has an inline citation. Uncertain items are marked [NEEDS VERIFICATION]. The briefs follow SPJ Code of Ethics standards because that's the standard I held myself to for six years of investigative reporting.

What the research found:

The $200 late filing fee has never deterred anyone. It's routinely waived. No criminal prosecution has ever been brought under the STOCK Act. OGE has had four directors in a single year — the Senate-confirmed director was removed by Friday night email. Bryan Bedford held airline stock 150 days past his divestiture deadline, and a merger during the delay converted his 16,000 private shares into 650,000 public shares. Frank Bisignano's divestiture timing avoided roughly $300 million in losses when Fiserv crashed 40% after he sold. Trump is buying $100 million in bonds from companies affected by his policies — unprecedented for a sitting president.

Canada has an independent ethics commissioner with real enforcement authority. The U.S. has OGE, which can write letters.

The research lives in `/research/` — six markdown files totaling about 35,000 words. It's not for the public. It's the knowledge base that makes everything else possible. When I write a summary for an official's page, I need to know whether "late filing" means the same thing as "missing the divestiture deadline" (it doesn't). When I flag a purchase as noteworthy, I need to know whether purchases are inherently problematic (they're not, unless the official is buying in a sector their agency regulates). When I say "no one has been prosecuted under the STOCK Act," I need to be certain that's true (it is — Chris Collins was prosecuted under securities fraud statutes, not the STOCK Act itself).

Journalism tools are only as good as the journalism behind them.

## The Data Expansion

The MVP had 29 officials. I'd been told there were 37 with freely downloadable PDFs. My previous session had identified the gap but hadn't closed it.

I ran an audit against the OGE API and found the missing officials: Stacey Dixon (Principal Deputy DNI, 111 transactions — the biggest single add), Deanne Criswell (FEMA Administrator), Katharine MacGregor (Deputy Secretary of Interior), Michael Whitaker (FAA Administrator), and Paul Lawrence (Deputy Secretary of VA). Three Biden holdovers, two current administration.

Adding them revealed a problem with the swim lane chart. Dixon's transactions go back to 2021. When you put 2021 and 2026 data on the same x-axis, the current-administration trades compress into the right 20% of the chart. The whole visualization becomes unreadable.

The fix: time range filters. "Since inauguration" (the default), "2025," "2026," and "All time." Now the swim lane defaults to showing trades from January 20, 2025, forward — filling the full chart width. If you want to see Dixon's 2021 divestiture spree, switch to "All time."

I also updated nine officials whose filing dates were stale. The OGE processes filings through multiple review steps before posting publicly — the "new" filings were mostly the same transactions with updated certification dates.

Final count: 34 officials, 2,320 transactions.

## The Mobile Problem

Mobile broke in about five places. The company lookup table ran off the right edge of the screen. The filing process explainer showed as two cramped columns with arrows pointing sideways into nothing. The swim lane chart was unusable.

The company table fix: hide the "Officials" and "Est. value" columns on small screens, truncate company names. The filing process fix: vertical stack with down arrows on mobile, horizontal row with right arrows on desktop. The swim lane fix: HTML card layout with inline SVG dot strips replacing the full SVG chart.

Mobile-first would have been easier. Desktop-first means every component has a retroactive responsive pass. I keep making this mistake.

## The Scrollytelling

I looked at the Texas Tribune salary explorer and the scrollytelling pattern clicked. A sticky visualization on one side, narrative text cards scrolling past on the other. As each card enters the viewport, the viz updates.

I built two scrollytelling sections: "How disclosure works" (6 steps from nomination to compliance) and "How this was built" (7 steps from OGE API to AI transparency). Each uses Intersection Observer to detect the active step and update a vertical timeline on the left.

On mobile, the sticky viz hides and the cards show inline with step numbers. It degrades gracefully. The Tribune would approve.

## The AI Transparency Question

A thought experiment: if I show this to a Texas Tribune editor, what's the first thing they ask?

"How much of this did the AI write?"

The honest answer is: most of the code, significant portions of the research, and all of the official summaries. The editorial decisions — what to build, how to frame it, what to flag, what to skip — those are mine. The fact-checking pass was mine. The design sensibility is mine (with input from a model that kept wanting to add gradient hero sections).

So I added an AI transparency section to the About page. It lists exactly where AI is used: PDF parsing (Claude Haiku), official summaries (AI-generated, reviewed), news coverage (AI-assisted search), codebase (built with Claude Code). And what AI doesn't do: no fabricated data, no editorial judgments, no decisions about who to track or how to present findings.

The framing I landed on: "Built by Trevor Brown with the assistance of Claude Code." That's the truth. I'm the journalist. The AI is the tool. A very powerful tool that occasionally needs to be told it's wrong about federal law, but a tool nonetheless.

## What's Next

The static JSON approach got us to 34 officials and 2,320 transactions. That's the limit of what manual parsing can sustain. The next session is the database migration and automated pipeline — a script that hits the OGE API daily, downloads new PDFs, parses them with Claude's API, and writes structured data. The research vault makes the parsing smarter because we now know exactly what a "late filing" means, what the amount ranges are, and how to handle edge cases like "value not readily ascertainable."

The tool works. The data is real. The research is solid. Now it needs to stay current without me manually downloading PDFs at midnight.
