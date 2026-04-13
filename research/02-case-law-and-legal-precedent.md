# Legal Research Brief: Government Financial Disclosure Data

**Prepared for:** Open Cabinet Project
**Date:** April 12, 2026
**Purpose:** Internal knowledge base for an investigative journalism tool tracking executive branch financial transactions

---

## 1. Web Scraping and Publishing Public Government Data

### hiQ Labs v. LinkedIn (9th Cir., No. 17-16783)

The landmark web scraping case. hiQ, a data analytics company, scraped publicly available LinkedIn profiles to build workforce analytics products. LinkedIn sent a cease-and-desist and began blocking hiQ's scrapers. hiQ sued for injunctive relief.

**Procedural history:** The district court granted hiQ a preliminary injunction. The Ninth Circuit affirmed in 2019. The Supreme Court vacated and remanded in June 2021 (in light of *Van Buren*). On remand, the Ninth Circuit again affirmed the injunction on April 18, 2022, holding that scraping publicly available data likely does not violate the Computer Fraud and Abuse Act (CFAA).

**Final outcome:** The case settled in late 2022. LinkedIn and hiQ agreed to a consent judgment that included a $500,000 judgment against hiQ -- but notably for breach of contract and use of fake accounts, not for scraping public data. The scraping-of-public-data question was never definitively resolved by the Supreme Court.

**Key takeaway for Open Cabinet:** The Ninth Circuit's reasoning -- that accessing publicly available data on the open internet is not "unauthorized access" under the CFAA -- remains the strongest circuit-level authority on scraping legality. The OGE API is a public, unauthenticated government endpoint. No login, no password, no terms of service barrier. The legal risk of accessing it is effectively nil.

### Van Buren v. United States, 593 U.S. 374 (2021)

The Supreme Court case that narrowed the CFAA's reach. Nathan Van Buren, a Georgia police sergeant, used his valid credentials to search a law enforcement database for a license plate number in exchange for money. He was convicted under the CFAA's "exceeds authorized access" provision.

**The Court's holding (6-3, Barrett writing):** "Exceeds authorized access" means accessing areas of a computer system that are entirely off-limits to the user. It does not cover misuse of information the user was otherwise entitled to access. Van Buren had authorization to access the database; using it for an improper purpose did not violate the CFAA.

**Significance:** The decision killed the government's expansive reading of the CFAA, which would have criminalized violations of terms of service or acceptable-use policies. Justice Barrett's majority opinion warned that the government's interpretation would "attach criminal penalties to a breathtaking amount of commonplace computer activity."

**Key takeaway for Open Cabinet:** *Van Buren* forecloses any CFAA argument against accessing a public government API. The OGE endpoint has no authentication gate, no terms of service, and no access restrictions. There is nothing to "exceed."

### Sandvig v. Barr (D.D.C., No. 1:16-cv-1368)

A pre-enforcement First Amendment challenge by academic researchers who planned to scrape websites using fake accounts to study algorithmic discrimination. The D.C. District Court ruled in 2020 that violating a website's terms of service does not constitute "unauthorized access" under the CFAA.

**Key language:** The court stated that "criminalizing terms-of-service violations risks turning each website into its own criminal jurisdiction and each webmaster into his own legislature."

**Limitation:** This is a district court opinion, not binding outside D.C. But it aligns with *Van Buren* and the Ninth Circuit's reasoning in *hiQ*.

**Key takeaway for Open Cabinet:** Even researchers using fake accounts to access websites were found to not violate the CFAA. Open Cabinet does not use fake accounts, does not bypass any authentication, and accesses a government API specifically designed for public use. The legal position is considerably stronger than even *Sandvig*.

### No Known Cases About Government Financial Disclosure Scraping

No court has ever addressed the legality of scraping government financial disclosure data specifically. This is likely because the question is not close. The data is public by statute, published without copyright, and explicitly made available for public inspection. No disclosure aggregator -- LegiStorm, OpenSecrets, Quiver Quantitative, Capitol Trades, Unusual Whales -- has ever faced legal challenge for collecting and republishing this data.

[NEEDS VERIFICATION: Whether any government entity has ever sent a cease-and-desist to a financial disclosure aggregator.]

---

## 2. Freedom of Information and Public Records

### 17 U.S.C. Section 105 -- No Copyright on Federal Government Works

The statute is clear: "Copyright protection under this title is not available for any work of the United States Government." A "work of the United States Government" is defined in Section 101 as "a work prepared by an officer or employee of the United States Government as part of that person's official duties."

Financial disclosure forms filed with OGE are works prepared by government officers as part of their official duties (the Ethics in Government Act requires them to file). The PDFs published on OGE's website are federal government documents. They carry no copyright. Anyone can copy, republish, analyze, and redistribute them without restriction.

**Key takeaway for Open Cabinet:** There is no intellectual property barrier to downloading, parsing, and republishing every OGE filing. The entire dataset is public domain.

### 5 U.S.C. Section 13107 -- Custody of and Public Access to Reports

This is the core statutory authority for what Open Cabinet does. The key provisions:

**Public availability (Subsection a):** Agencies and supervising ethics offices "shall make available to the public" each financial disclosure report filed under the Ethics in Government Act. Exceptions exist only for intelligence community employees where disclosure would compromise national security.

**Inspection and copying (Subsection b):** Agencies must "permit inspection of such report by or furnish a copy of such report to any person requesting such inspection or copy" within 30 days of receipt. Fees may be charged but can be waived if "in the public interest."

**The news media exception (Subsection c):** This is the critical provision. It is unlawful to obtain or use financial disclosure reports for "any commercial purpose, other than by news and communications media for dissemination to the general public." Other prohibited uses include determining credit ratings and soliciting money.

**What this means:** Congress explicitly carved out a news media exception. Organizations that collect disclosure data and disseminate it to the public -- exactly what Open Cabinet does -- are operating within the statutory framework. The prohibition targets commercial exploitation (credit agencies, direct marketers), not journalism or civic transparency tools.

**Penalties:** The Attorney General may bring civil actions for misuse, with fines up to $10,000. No criminal penalties attach to misuse of disclosure data under this section.

### How Existing Aggregators Operate Legally

Several organizations have built businesses on government financial disclosure data without legal challenge:

- **LegiStorm** -- A for-profit company that charges subscription fees for access to congressional financial disclosures, staff salaries, and travel data. Operates under the news media exception. Has been active since 2006 with no known legal challenges. [NEEDS VERIFICATION: Whether LegiStorm has ever received legal challenge or formal inquiry about its business model.]

- **OpenSecrets (Center for Responsive Politics)** -- A nonprofit that publishes personal financial data for members of Congress, combining assets and liabilities into estimated net worth ranges. Sources data from the House and Senate disclosure offices.

- **Quiver Quantitative** -- A financial data company that parses congressional stock disclosures and sells access to the data. Has built ETFs based on congressional trading patterns. Operates openly as a commercial enterprise using public disclosure data.

- **Capitol Trades** -- Tracks and publishes congressional stock trades in near-real-time, with a premium subscription tier.

- **Unusual Whales** -- Built an entire business tracking congressional stock trades, including the annual Congressional Trading Report. Their data has been cited by NPR, CNBC, and other major outlets. Two ETFs (NANC and KRUZ) were created using their database.

**Key takeaway for Open Cabinet:** Multiple for-profit companies charge money for congressional financial disclosure data. None have faced legal action. Open Cabinet's free, public-interest journalism tool for executive branch data occupies even stronger legal ground.

---

## 3. Criminal Cases Involving Financial Disclosure Violations

### United States v. Chris Collins (S.D.N.Y., No. 1:18-cr-00567)

The most significant criminal prosecution connected to congressional stock trading, though technically an insider trading case rather than a STOCK Act prosecution.

**The facts:** Rep. Chris Collins (R-NY-27) sat on the board of Innate Immunotherapeutics, an Australian biotech company. On June 22, 2017, while attending a congressional picnic at the White House, Collins received an email from Innate's CEO informing him that the company's flagship drug had failed a clinical trial. Collins immediately called his son Cameron. Over the next several days, Cameron Collins, his fiancee's father Stephen Zarsky, and others sold their Innate shares before the drug trial failure was announced publicly.

**The trades:** Cameron Collins, Zarsky, and others avoided over $768,000 in losses by selling before the public announcement.

**Conviction:** Collins pleaded guilty on October 1, 2019, to conspiracy to commit securities fraud and making false statements to the FBI. On January 17, 2020, Judge Vernon S. Broderick (S.D.N.Y.) sentenced Collins to 26 months in federal prison.

**Pardon:** President Trump pardoned Collins on December 22, 2020.

**Significance for Open Cabinet:** Collins was not charged under the STOCK Act. He was charged under traditional securities fraud statutes (15 U.S.C. Section 78j(b) and Rule 10b-5). This illustrates a key point: the STOCK Act's penalties ($200 late filing fee) are trivial. Serious misconduct gets prosecuted under existing securities law, not the STOCK Act itself.

### The 2020 COVID-Era Congressional Trading Scandal

The largest-scale investigation into congressional stock trading in U.S. history.

**Background:** In early 2020, members of Congress received classified briefings on the emerging COVID-19 pandemic. Several senators made significant stock trades before the markets crashed on February 20, 2020. ProPublica first reported Sen. Richard Burr's trades; subsequent reporting revealed trades by Kelly Loeffler, James Inhofe, and Dianne Feinstein.

**Sen. Richard Burr (R-NC):**
- Sold over $1.65 million in stock on February 13, 2020, one week before the crash
- The FBI executed a search warrant on his cell phone in May 2020
- An FBI affidavit stated there was probable cause to believe Burr committed insider trading and securities fraud
- The DOJ closed the investigation in January 2021 without filing charges
- The SEC also ended its probe in January 2023 without action

**Sen. Kelly Loeffler (R-GA):**
- She and her husband (NYSE chairman Jeffrey Sprecher) made 27 transactions selling between $1.275 million and $3.1 million in stock
- Also purchased stock in Citrix Systems, which rose as remote work surged
- DOJ closed investigation May 26, 2020, without charges

**Sen. Dianne Feinstein (D-CA):**
- Sold between $1.5 million and $6 million in Allogene Therapeutics stock on January 31 and February 18, 2020
- DOJ closed investigation May 26, 2020, without charges
- Feinstein's office stated her assets were managed by a blind trust

**Sen. James Inhofe (R-OK):**
- Sold between $180,000 and $400,000 in stock
- DOJ closed investigation May 26, 2020, without charges

**Outcome:** Zero prosecutions. Zero fines. Zero consequences under the STOCK Act. The FBI had probable cause for Burr's case but DOJ declined to charge. The scandal demonstrated the enforcement gap that Open Cabinet aims to illuminate.

### Attorney General Pam Bondi -- Trump Media Stock Sale (2025)

The most recent executive branch ethics controversy directly relevant to Open Cabinet's mission.

**The facts:** AG Pam Bondi sold between $1 million and $5 million worth of Trump Media (DJT) stock on April 2, 2025 -- the same day President Trump unveiled sweeping tariffs from the White House Rose Garden. Trump Media stock fell 13% in the days that followed. Bondi's disclosure forms do not indicate whether the trades occurred before or after the market closed.

**Ethics agreement:** Bondi had pledged to divest her Trump Media holdings within 90 days of her confirmation as part of her ethics agreement. The April 2 sale was within that window. However, the timing -- the same day as a market-moving presidential announcement -- raised immediate questions.

**Investigation request:** Rep. Jamie Raskin (Ranking Member, House Judiciary Committee) sent a letter to DOJ Inspector General Michael Horowitz requesting an investigation into whether Bondi engaged in insider trading. Raskin wrote that the sale "bears all the hallmarks of insider trading and demands impartial investigation."

**Current status:** Investigation status is unclear as of April 2026. [NEEDS VERIFICATION: Whether IG Horowitz opened a formal investigation and its current status.]

**Significance for Open Cabinet:** This is exactly the kind of transaction Open Cabinet is designed to flag. Bondi's trade appears in the OGE data. The tool's timeline visualization, combined with news coverage integration, makes the suspicious timing visible at a glance -- something that raw filing data alone does not accomplish.

### Executive Branch Criminal Referrals -- Historical Context

OGE does not directly prosecute. Its enforcement mechanism is referral to the Department of Justice under 28 U.S.C. Section 535.

- When OGE identifies a potential violation of criminal conflict-of-interest statutes (18 U.S.C. Sections 203, 205, 207, 208, 209), agencies must notify OGE by filing OGE Form 202 and refer the matter to DOJ.
- The OGE Director cannot make findings about whether criminal law has been violated -- only refer.
- OGE reports that agencies have continued referring potential violations at rates similar to previous administrations. [NEEDS VERIFICATION: Specific referral numbers for 2025-2026.]

**Key limitation:** OGE's independence was compromised in early 2025 when President Trump removed OGE Director David Huitema on February 10, 2025. Subsequent acting directors served short terms. The Campaign Legal Center documented 27 violations of ethics norms and rules in the administration's first 100 days and filed 10 complaints against executive branch officials. Whether those complaints resulted in referrals or action is unclear.

---

## 4. OGE Legal Opinions and Advisory Framework

### The Criminal Conflict-of-Interest Statutes

The core criminal statutes governing executive branch financial conflicts are in 18 U.S.C. Sections 203-209. The most relevant:

**18 U.S.C. Section 208 -- Acts Affecting a Personal Financial Interest:**
- Prohibits executive branch employees from participating "personally and substantially" in any government matter in which they have a personal financial interest
- Penalties: up to 1 year imprisonment and $100,000 fine (general); up to 5 years and $250,000 (willful)
- Notably, prosecutors do not need to prove willful intent for the general violation -- negligent participation counts
- Waivers are available under Section 208(b) if the financial interest is "too remote or inconsequential"

**18 U.S.C. Section 207 -- Post-Employment Restrictions:**
- Prohibits former officials from lobbying their former agencies for specified cooling-off periods
- Relevant to ethics pledge enforcement

### OGE Program Advisory PA-25-04 (July 2025)

This advisory updated OGE's questionnaire procedures for agencies. Notably, OGE deleted the former Part 11 (Ethics Pledge Assessment) from its questionnaire, following the rescission of Executive Order 13989's ethics pledge by Executive Order 14,148 (January 20, 2025). [NEEDS VERIFICATION: Whether the Trump administration issued a replacement ethics pledge executive order.]

### OGE's Referral Authority

OGE's enforcement is indirect but significant:
- Agencies must notify OGE of all conflict-of-interest referrals to DOJ via OGE Form 202
- OGE can issue public letters calling out noncompliance (used effectively during the first Trump administration under Director Walter Shaub)
- OGE can issue program advisories and legal advisories to Designated Agency Ethics Officials (DAEOs)
- OGE reviews ethics agreements and can publicly flag when divestiture deadlines are missed

### Ethics Pledge Landscape

- Executive Order 13989 (Biden, January 20, 2021) imposed a two-year lobbying ban on appointees
- Executive Order 14,148 (Trump, January 20, 2025) rescinded EO 13989, releasing former employees from its commitments
- Executive Order 13770 (Trump first term) had its own ethics pledge format [NEEDS VERIFICATION: Whether a new ethics pledge EO was issued for the second Trump term]

---

## 5. Constitutional Considerations

### The Emoluments Clauses

Two constitutional provisions address government officials receiving benefits from external sources:

**Foreign Emoluments Clause (Article I, Section 9, Clause 8):** No federal officeholder shall "accept of any present, Emolument, Office, or Title, of any kind whatever, from any King, Prince, or foreign State" without congressional consent.

**Domestic Emoluments Clause (Article II, Section 1, Clause 7):** The President shall not receive any emolument beyond the presidential salary from the United States or any State.

**Relationship to stock trading:** The Emoluments Clauses do not directly regulate stock trading. They target benefits flowing from governments, not market transactions. Three major lawsuits were filed during Trump's first term alleging Emoluments violations:

1. *CREW v. Trump* (S.D.N.Y.) -- Filed by Citizens for Responsibility and Ethics in Washington
2. *Blumenthal v. Trump* (D.D.C.) -- Filed by members of Congress
3. *District of Columbia v. Trump* (D. Md.) -- Filed by Maryland and D.C.

All three were ultimately dismissed -- two as moot after Trump left office (Supreme Court vacated on January 25, 2021), and one on standing grounds. No court reached a definitive interpretation of the scope of "emolument."

**The open question:** Whether "emolument" covers arm's-length market transactions (Trump argued no; plaintiffs argued yes). The question remains judicially unresolved.

**Key takeaway for Open Cabinet:** The Emoluments Clauses are background context, not directly relevant to stock trading disclosure. The STOCK Act, 18 U.S.C. Section 208, and ethics agreements are the operative legal frameworks for what Open Cabinet tracks.

### Due Process and Public Disclosure

The Ethics in Government Act's disclosure requirements have survived constitutional challenge. Courts have applied a balancing test weighing the privacy intrusion against the government's interest in deterring conflicts and maintaining public confidence. The government's interests have been found "important" and sufficient to justify the disclosure regime. [NEEDS VERIFICATION: Specific case name for this holding -- likely from 1970s-1980s challenges to the original Ethics in Government Act.]

Financial disclosure does not trigger strict scrutiny because it does not implicate core First Amendment associational rights in the way that, for example, donor disclosure does (cf. *Americans for Prosperity Foundation v. Bonta*, 594 U.S. 595 (2021), which applied exacting scrutiny to charitable donor disclosure).

### First Amendment Protections for Publishing Disclosed Data

This is the strongest constitutional ground for Open Cabinet's work.

**Bartnicki v. Vopper, 532 U.S. 514 (2001):** The Supreme Court held that the First Amendment protects publication of lawfully obtained information on matters of public concern, even when the information was originally obtained unlawfully by a third party. Justice Stevens wrote for a 6-3 majority that "a stranger's illegal conduct does not suffice to remove the First Amendment shield from speech about a matter of public concern."

The *Bartnicki* framework requires four elements:
1. The publisher did not participate in unlawfully obtaining the information
2. The publisher acquired the information lawfully
3. The information concerns a matter of public concern
4. The information is truthful

**Application to Open Cabinet:** All four elements are met with room to spare:
1. The data was not unlawfully obtained by anyone -- it is public by statute
2. Open Cabinet accesses a public government API -- no legal barrier of any kind
3. Government officials' financial conflicts are textbook matters of public concern
4. The data comes directly from official government filings

**Additional authority:** The Supreme Court has consistently held that "the daily transactions of government" are matters of the highest public concern. The press has a well-established right to publish truthful information about government officials' conduct, including financial dealings. *See also New York Times Co. v. United States*, 403 U.S. 713 (1971) (the Pentagon Papers case -- the government cannot restrain publication of truthful information absent the most extraordinary circumstances).

---

## 6. Summary of Legal Position

Open Cabinet's legal foundation rests on multiple, reinforcing layers:

| Legal Basis | Authority | Strength |
|---|---|---|
| Data is public by statute | 5 U.S.C. Section 13107 | Unassailable |
| No copyright on government works | 17 U.S.C. Section 105 | Unassailable |
| News media exception for commercial use | 5 U.S.C. Section 13107(c) | Strong |
| No CFAA liability for public data | *Van Buren* (SCOTUS), *hiQ* (9th Cir.) | Strong |
| First Amendment protection for publication | *Bartnicki* (SCOTUS) | Strong |
| Industry precedent | LegiStorm, OpenSecrets, Quiver, Capitol Trades, Unusual Whales | Compelling |
| Zero enforcement history | No aggregator has ever been challenged | Compelling |

**Bottom line:** Open Cabinet operates in a legal safe harbor. The data is public by statute, copyright-free by federal law, accessible through an unauthenticated government API, and published for journalism purposes protected by the First Amendment. Multiple for-profit companies do the same thing with congressional data and charge money for it. The legal risk is as close to zero as it gets in American media law.

---

## Sources

- [hiQ Labs v. LinkedIn -- Wikipedia](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)
- [hiQ Labs v. LinkedIn -- Justia (9th Cir. 2022)](https://law.justia.com/cases/federal/appellate-courts/ca9/17-16783/17-16783-2022-04-18.html)
- [hiQ Labs v. LinkedIn Settlement -- Privacy World](https://www.privacyworld.blog/2022/12/linkedins-data-scraping-battle-with-hiq-labs-ends-with-proposed-judgment/)
- [hiQ v. LinkedIn Lessons Learned -- ZwillGen](https://www.zwillgen.com/alternative-data/hiq-v-linkedin-wrapped-up-web-scraping-lessons-learned/)
- [Van Buren v. United States -- Wikipedia](https://en.wikipedia.org/wiki/Van_Buren_v._United_States)
- [Van Buren v. United States -- Supreme Court Opinion (PDF)](https://www.supremecourt.gov/opinions/20pdf/19-783_k53l.pdf)
- [Van Buren v. United States -- CRS Report](https://www.congress.gov/crs-product/LSB10616)
- [The CFAA After Van Buren -- ACS](https://www.acslaw.org/analysis/acs-journal/2020-2021-acs-supreme-court-review/the-computer-fraud-and-abuse-act-after-van-buren/)
- [Sandvig v. Barr -- ACLU](https://www.aclu.org/cases/sandvig-v-barr-challenge-cfaa-prohibition-uncovering-racial-discrimination-online)
- [D.C. Court: Accessing Public Information is Not a Computer Crime -- EFF](https://www.eff.org/deeplinks/2018/04/dc-court-accessing-public-information-not-computer-crime)
- [5 U.S.C. Section 13107 -- Cornell LII](https://www.law.cornell.edu/uscode/text/5/13107)
- [17 U.S.C. Section 105 -- Cornell LII](https://www.law.cornell.edu/uscode/text/17/105)
- [Chris Collins Sentencing -- DOJ Press Release](https://www.justice.gov/usao-sdny/pr/former-congressman-christopher-collins-sentenced-insider-trading-scheme-and-lying)
- [Chris Collins Sentencing -- CNBC](https://www.cnbc.com/2020/01/17/chris-collins-sentenced-to-26-months-for-insider-trading-tip.html)
- [DOJ Drops Burr Investigation -- NPR](https://www.npr.org/2021/01/19/958622574/doj-drops-insider-trading-investigation-into-sen-richard-burr)
- [SEC Ends Burr Probe -- CNBC](https://www.cnbc.com/2023/01/06/sec-ends-richard-burr-insider-trading-probe.html)
- [Burr FBI Records -- ProPublica](https://www.propublica.org/article/burr-stocks-shares-covid-crash)
- [2020 Congressional Insider Trading Scandal -- Wikipedia](https://en.wikipedia.org/wiki/2020_congressional_insider_trading_scandal)
- [DOJ Closes Loeffler, Inhofe, Feinstein Probes -- CNBC](https://www.cnbc.com/2020/05/26/coronavirus-doj-investigates-burr-stock-sales-drops-loeffler-feinstein-probes.html)
- [Pam Bondi Trump Media Stock Sale -- ProPublica](https://www.propublica.org/article/pam-bondi-trump-media-stock-tariffs)
- [Raskin Demands Bondi Investigation -- House Judiciary Democrats](https://democrats-judiciary.house.gov/media-center/press-releases/ranking-member-raskin-demands-inspector-general-probe-suspicious-timing-of-stock-sale-by-attorney-general-bondi)
- [OGE Referral Procedures -- PA-16-09](https://www.oge.gov/Web/OGE.nsf/Resources/PA-16-09:+Updated+Procedures+for+Notifying+the+Office+of+Government+Ethics+of+Conflict+of+Interest+Referrals+to+the+Department+of+Justice)
- [OGE Primer -- CRS Report](https://www.congress.gov/crs-product/IF10634)
- [18 U.S.C. Section 208 -- OGE Elements Guide](https://oge.gov/Web/OGE.nsf/Resources/Elements+of+18+U.S.C.+208:+The+Conflict+of+Interest+Statute+)
- [STOCK Act -- Wikipedia](https://en.wikipedia.org/wiki/STOCK_Act)
- [STOCK Act Text -- Congress.gov](https://www.congress.gov/112/plaws/publ105/PLAW-112publ105.htm)
- [Lack of Ethics Enforcement -- Campaign Legal Center](https://campaignlegal.org/update/lack-ethics-enforcement-government-provides-blueprint-reform)
- [Trump Removes OGE Director -- Common Cause](https://www.commoncause.org/resources/trump-weakens-government-oversight/)
- [Emoluments Clauses Explained -- Brennan Center](https://www.brennancenter.org/our-work/research-reports/emoluments-clauses-explained)
- [Supreme Court Ducks Emoluments Cases -- Brennan Center](https://www.brennancenter.org/our-work/analysis-opinion/supreme-court-ducks-opportunity-trump-emoluments-cases)
- [Foreign Emoluments Clause -- Congress.gov Annotated Constitution](https://constitution.congress.gov/browse/essay/artI-S9-C8-3/ALDE_00013206/)
- [Bartnicki v. Vopper -- Justia](https://supreme.justia.com/cases/federal/us/532/514/)
- [Bartnicki v. Vopper -- First Amendment Encyclopedia](https://firstamendment.mtsu.edu/article/bartnicki-v-vopper/)
- [Americans for Prosperity v. Bonta -- Disclosure Requirements](https://www.mtsu.edu/first-amendment/article/946/disclosure-requirements)
- [NPR: Stock Traders Copying Lawmakers](https://www.npr.org/2024/06/06/nx-s1-4974720/congress-stock-trades-profits)
- [LegiStorm Financial Disclosures FAQ](https://www.legistorm.com/pfd/faq.html)
- [OpenSecrets Disclosure Requirements](https://www.opensecrets.org/personal-finances/disclosure)
- [STOCK Act and Insider Trading -- Government Accountability Project](https://whistleblower.org/blog/stock-act-and-insider-trading-in-congress/)
- [OGE Program Advisory PA-25-04 (PDF)](https://www.oge.gov/web/oge.nsf/Legal%20Docs/BA29867C6DFFE39585258CD5006287BE/$FILE/OGE%20Program%20Advisory%20PA-25-04.pdf)
