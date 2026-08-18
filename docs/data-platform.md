# Bytor Hockey Data Platform

## Status

This document defines the intended scope, architecture and operating principles of the `bytor-hockey-data` repository.

It is a product and architecture compass, not an implementation specification. The repository may evolve, but changes should preserve the separation between source data, canonical data, ingestion logic and downstream consumers described here.

---

## 1. Purpose

`bytor-hockey-data` is the canonical data platform for Bytor's knowledge about the ice hockey ecosystem.

Its purpose is to build and maintain a structured, historical and extensible dataset that can be used independently of any single website, federation, league management system or external provider.

The repository is not primarily a scraper repository and it is not intended to mirror England Ice Hockey, GameDay, Elite Prospects or any other external service.

External services are sources of evidence. Bytor owns the canonical model.

The platform should eventually support:

- competitive junior hockey;
- competitive senior hockey;
- women's hockey;
- recreational hockey;
- historical and inactive leagues;
- historical and inactive teams;
- rinks and ice venues;
- organisations and clubs;
- hockey shops and retailers;
- specialist hockey training facilities;
- synthetic ice facilities;
- future hockey-related entities where they fit the data model.

The data should support both current and historical views.

---

## 2. Long-term goals

The platform should make it possible to answer questions such as:

- Which teams played in U14 South 1 in the 2014/15 season?
- How did the geographical footprint of a league change between 2010 and 2026?
- Which rinks currently host recreational hockey within 50 miles of a location?
- Which junior teams existed historically but are no longer active?
- Which clubs operate multiple age-group teams?
- Which teams moved between divisions over time?
- Where are hockey shops, shooting facilities and synthetic ice training centres?
- Which competitions, teams or venues are missing data?
- What changed between two seasons?
- Which areas of the UK have weak or strong hockey coverage?

The repository should be useful for both operational website features and deeper analysis.

Expected consumers include:

- Bytor TeamFinder;
- interactive maps;
- league and team pages;
- historical views;
- statistics and research;
- geographic analysis;
- internal tooling;
- future AI agents;
- APIs or generated datasets consumed by other Bytor applications.

---

## 3. Core principle: canonical data is independent of sources

The most important architectural rule is:

> Source data describes what an external source says. Canonical data describes what Bytor believes the entity is.

A source may call the same team:

- `MK Storm U14`;
- `Milton Keynes Storm U14`;
- `MK Storm`;
- `MK Storm Under 14s`.

These are source observations.

The canonical entity should still be one stable `Team`.

Similarly, a competition should not be recreated simply because an external provider changes its name, URL or identifier.

Provider-specific identifiers belong in `externalIds` and source metadata. They must not become the primary identity of Bytor entities.

---

## 4. Canonical domain model

### 4.1 Team

A `Team` represents a persistent sporting identity.

Examples:

- MK Storm U14;
- Cambridge Grizzlies U10;
- a recreational adult team;
- a historical team that no longer exists.

A Team may exist across multiple seasons.

A Team should not be duplicated merely because:

- it appears in another season;
- it changes division;
- a provider changes spelling;
- an abbreviation changes;
- the source URL changes.

A Team may have:

- aliases;
- historical names;
- external provider identifiers;
- current or historical status;
- organisation relationships;
- rink relationships;
- age/gender/category metadata.

---

### 4.2 Competition

A `Competition` represents a persistent competitive structure or league identity.

Examples:

- NIHL National;
- U14 South 1;
- U19 National;
- a recreational league;
- a historical competition.

The Competition itself is season-independent.

---

### 4.3 CompetitionSeason

A `CompetitionSeason` represents one occurrence of a Competition in a specific season.

Examples:

- U14 South 1, 2025/26;
- NIHL National, 2024/25;
- a recreational league, 2018/19.

Historical data belongs here rather than in duplicated Competition entities.

This is the primary mechanism that allows Bytor to retain many seasons of history.

---

### 4.4 CompetitionGroup

A `CompetitionGroup` represents an optional subdivision within a CompetitionSeason.

Examples:

- East / West;
- conference;
- pool;
- regional subgroup.

It should only exist when the source structure actually requires a subdivision.

---

### 4.5 TeamParticipation

A `TeamParticipation` connects a Team to a CompetitionSeason and, optionally, a CompetitionGroup.

This answers:

> Which team participated in which competition structure during this season?

Participation is historical.

A team changing leagues between seasons should not create a new Team. It should create different TeamParticipation relationships.

---

### 4.6 Organisation

An `Organisation` represents the wider club or organisation behind one or more teams when that relationship is known.

Examples could include a junior club operating U10, U12, U14 and U16 squads.

The organisation is separate from the Team because teams may appear, disappear or change names while the wider organisation continues to exist.

---

### 4.7 Rink

A `Rink` represents a real ice rink or ice venue.

It may contain:

- coordinates;
- address;
- city;
- websites;
- external identifiers;
- relationships to teams.

A rink is not the same thing as a synthetic ice or specialist training facility.

---

## 5. Future domain areas

### 5.1 Hockey retailers

Hockey shops belong in the data platform but should use their own domain model rather than being represented as teams, organisations or rinks.

A future model may contain entities such as:

```text
Retailer
RetailLocation
```

Possible attributes:

- name;
- website;
- online/offline;
- physical locations;
- country;
- brands;
- specialties;
- status;
- source references.

The exact schema should be designed when the feature is implemented rather than generalized prematurely.

---

### 5.2 Specialist training facilities

Specialist hockey training should also be represented separately from ice rinks.

Possible future examples:

- synthetic ice;
- shooting lanes;
- skating treadmills;
- goalie training centres;
- hockey-specific gyms;
- skills development centres.

A future entity may resemble:

```text
TrainingFacility
```

with one or more facility types.

Do not classify synthetic ice as a `Rink` simply because skating may take place there.

---

## 6. Historical data is a first-class requirement

The platform must support incomplete, old and no-longer-current information.

Historical entities should generally be retained instead of deleted.

Examples:

- a league that existed from 2008 to 2013;
- a team that folded;
- a rink that closed;
- an old competition structure;
- a historical team name;
- a season for which only participating teams are known.

The absence of complete standings or fixtures must not prevent a historical CompetitionSeason or TeamParticipation from existing.

We should be able to represent:

```text
known:
- CompetitionSeason existed
- Team A participated
- Team B participated

unknown:
- final standings
- complete fixtures
- scores
```

Unknown information should remain unknown rather than being inferred.

---

## 7. Sources and evidence

External information may come from many forms:

- federation websites;
- league websites;
- GameDay;
- APIs;
- HTML pages;
- PDFs;
- archived pages;
- spreadsheets;
- screenshots;
- books;
- newspapers;
- club history pages;
- social media;
- manual research;
- information supplied directly by a knowledgeable person.

All of these are evidence sources.

They do not need identical ingestion mechanisms.

The platform should preserve enough source information to understand where a canonical assertion came from.

---

## 8. Reusable providers vs one-off research

There are two fundamentally different ingestion paths.

### 8.1 Reusable provider

Use a reusable provider when data is expected to be imported repeatedly.

Examples:

- GameDay;
- England Ice Hockey;
- EIHA recreational data;
- another stable league API.

A provider should encapsulate:

- fetching;
- provider-specific identifiers;
- provider-specific parsing;
- normalization into a provider snapshot.

The rest of the platform should not need to understand the provider's HTML or API structure.

---

### 8.2 One-off research

Do not build a permanent provider for every historical source.

Examples:

- a screenshot of a 2013 table;
- an old PDF;
- a newspaper scan;
- a historical club page;
- manually supplied information;
- an archived page that will only be used once.

These should enter through the research/import workflow.

A future agent should be able to inspect such evidence and propose canonical changes without requiring a dedicated scraper.

---

## 9. Data layers

The repository should maintain a clear separation between four layers.

### 9.1 Raw source data

Raw data is as close as practical to what the provider returned.

Examples:

```text
imports/<provider>/<snapshot>/raw/
```

It may include:

- HTML;
- JSON;
- API responses;
- downloaded files.

Raw data exists for reproducibility, debugging and auditing.

It is not canonical data.

---

### 9.2 Normalized provider snapshots

Provider-specific parsing should produce a normalized snapshot.

Example:

```text
imports/england-ice-hockey/2026-08-18/gameday/normalized/snapshot.json
```

A normalized snapshot may contain:

```text
competitions
teams
participations
standings
fixtures
```

The method used to discover those records is provider-specific.

For example:

```text
U10 membership
    <- fixture observations

U12-U19 membership
    <- ladders
```

This difference should disappear after normalization.

Downstream resolution and import code should not care whether a team was discovered through a ladder, fixture, API response or another provider mechanism.

---

### 9.3 Generated working data

Generated artifacts are temporary or reviewable pipeline outputs.

Examples:

```text
generated/proposals/
generated/resolution/
```

They may contain:

- proposed entities;
- reconciliation reports;
- unresolved identities;
- conflicts;
- audit reports.

Generated data is not canonical.

It may be deleted and regenerated where appropriate.

---

### 9.4 Canonical data

Canonical Bytor data lives under:

```text
data/
```

This is the durable database represented in repository form.

Canonical files should not depend on the current availability of an external provider.

Once imported and validated, they represent Bytor's persisted knowledge.

---

## 10. Identity resolution

Identity resolution is one of the most important responsibilities of the platform.

The system should prefer evidence in roughly this order:

1. existing trusted external provider ID;
2. explicit curated mapping;
3. strong canonical identity match;
4. deterministic heuristics;
5. human/agent review.

Name similarity alone should not silently merge entities when ambiguity exists.

A source anomaly should be represented explicitly rather than forced into the canonical model.

Example:

```text
provider competition: U14
provider team name: Manchester Storm Academy U16 B

result:
source anomaly
not an invented U14 Team
```

---

## 11. Curated mappings

Some source identities require human knowledge.

Curated mappings belong in durable repository data because they represent knowledge that should not need to be rediscovered on every import.

Example:

```text
data/mappings/
```

A curated mapping is different from a generated resolution report.

Generated resolution can be recreated.

A manually reviewed identity decision may need to persist.

---

## 12. Import philosophy

Import operations should be conservative.

The expected workflow is:

```text
source
  ->
snapshot
  ->
normalize
  ->
propose
  ->
resolve/reconcile
  ->
review conflicts
  ->
import
  ->
validate
  ->
audit
```

Not every import requires a human review if all identities are already known and deterministic.

However, ambiguous or destructive changes should stop rather than guess.

An importer should be idempotent where practical.

Running the same import twice should normally result in:

```text
created: 0
updated: 0
unchanged: N
```

rather than duplicates.

---

## 13. Incremental maintenance

Once a provider and canonical model are established, adding a new season should primarily be a data operation, not a new programming project.

The desired future workflow is conceptually:

```text
snapshot provider for 2026/27
resolve identities
create missing seasons
create/update participations
import new fixtures/results
audit
```

We should not need scripts such as:

```text
scrape-u14-2027.ts
scrape-u16-2027.ts
import-u14-2027.ts
```

unless the external source itself changes fundamentally.

Code should generalize across seasons.

Data should vary between seasons.

---

## 14. AI agent vision

A future AI agent should act as a research and ingestion assistant for this repository.

Example requests:

> We are missing U14 data for 2012-2018. I found an old page and some screenshots.

> I found a recreational league that existed for five years and is now inactive.

> A new recreational league started this season. Here are the teams.

> This old club changed its name in 2011. Add the historical information.

The agent should:

1. inspect existing canonical data;
2. inspect supplied evidence;
3. identify likely existing entities;
4. propose new entities and relationships;
5. detect conflicts and ambiguity;
6. explain uncertain decisions;
7. write only validated changes;
8. run repository validation and audits.

The agent should not freely edit YAML based only on language-model confidence.

Deterministic domain functions should perform actual mutations.

Conceptually:

```text
AI reasoning
    ↓
structured proposal
    ↓
domain operations
    ↓
schema validation
    ↓
canonical write
```

Possible future domain operations include:

```text
proposeTeam()
resolveTeam()
createCompetitionSeason()
createTeamParticipation()
addHistoricalName()
markEntityInactive()
attachSource()
validateDataset()
```

The AI decides what should happen.

The deterministic data layer decides whether that operation is structurally valid.

---

## 15. Research inbox

`research/inbox/` is the staging area for material that has not yet been incorporated into canonical data.

Possible contents:

```text
research/inbox/u14-2013-table.png
research/inbox/old-league.pdf
research/inbox/club-history.html
research/inbox/notes.md
```

Files in the inbox are evidence to investigate.

They are not automatically canonical.

After successful ingestion they may be archived, moved or retained according to a future research retention policy.

---

## 16. Downstream geography and TeamFinder

The canonical model should make geographic analysis possible without embedding map-specific concepts into the core entities.

For example:

```text
CompetitionSeason
    ↓
TeamParticipation
    ↓
Team
    ↓
Rink/location
    ↓
coordinates
```

This permits downstream features such as:

- league maps;
- team density;
- competition territory overlays;
- heatmaps;
- convex hulls;
- Voronoi regions;
- travel distances;
- geographic league comparisons;
- historical animations of league geography.

Map geometry should usually be derived from canonical data rather than stored as primary truth.

---

## 17. Statistics and analytical use

The repository should support statistics beyond what the public Bytor website immediately needs.

Examples:

- number of active teams by age group;
- growth or decline by region;
- rink utilisation;
- number of teams per organisation;
- historical league participation;
- geographic movement of competition structures;
- travel burden;
- team survival and inactivity;
- availability of hockey infrastructure.

This means preserving historical relationships is important even when they are not currently displayed on the website.

---

## 18. Games, fixtures and results

Games are a planned extension of the canonical model.

The game model should eventually support:

- scheduled league fixtures;
- completed games;
- postponed games;
- cancelled games;
- festival-style junior games;
- playoffs;
- tournament games;
- challenge games;
- friendlies/scrimmages where appropriate.

Provider-specific concepts such as GameDay `Bye` should not automatically become canonical games.

A bye may remain a provider observation without becoming a sporting event in the canonical dataset.

The game model should be designed separately before fixtures/results are imported at scale.

---

## 19. Repository responsibilities

The repository is responsible for:

- schemas;
- canonical entities;
- historical data;
- source references;
- provider ingestion;
- identity resolution;
- deterministic import logic;
- validation;
- data audits;
- research staging;
- generated review artifacts.

The repository is not responsible for:

- website UI;
- map rendering;
- SEO pages;
- frontend state;
- visualisation implementation;
- copying every field from every provider;
- behaving as a live proxy to external services.

Consumer applications should read exported or packaged canonical data rather than rely on provider-specific raw files.

---

## 20. Desired command surface

Exploratory tooling may temporarily require dedicated scripts.

Stable workflows should eventually converge toward a small command surface, for example:

```text
pnpm gameday:snapshot
pnpm gameday:plan
pnpm gameday:import
pnpm gameday:audit

pnpm validate
pnpm data-audit
```

Commands should operate on parameters such as season or snapshot rather than require separate scripts for every age group.

Diagnostic and experimental scripts should not become permanent public API unless they remain genuinely useful.

---

## 21. Validation principles

Canonical validation should check structural and semantic integrity.

Examples:

- duplicate canonical IDs;
- duplicate external IDs;
- invalid entity references;
- participation pointing to missing teams;
- participation pointing to missing competition seasons;
- incompatible age groups;
- impossible group/season relationships;
- ambiguous identities;
- invalid coordinates;
- malformed sources.

Provider audits should additionally prove that imported source data was accounted for.

A healthy provider import should be able to report:

```text
provider records
= resolved records
+ explicitly excluded anomalies
+ intentionally deferred records
+ unresolved failures
```

Unexplained loss should fail the audit.

---

## 22. Source anomalies and uncertainty

External data is not automatically correct.

The platform must support cases where:

- a team is in the wrong competition;
- a provider name contains an incorrect age group;
- two provider IDs appear to represent one entity;
- one provider ID is reused incorrectly;
- historical information conflicts between sources.

The system should preserve uncertainty rather than silently choose whichever source was imported last.

Where evidence is insufficient:

```text
status: unresolved
```

is preferable to a confident but false canonical relationship.

---

## 23. What should survive provider changes

If England Ice Hockey replaces GameDay tomorrow, the following should survive untouched:

```text
Team
Competition
CompetitionSeason
CompetitionGroup
TeamParticipation
Organisation
Rink
curated identity mappings
historical records
```

Only provider ingestion should need replacement.

This is a core test of the architecture.

---

## 24. Current architecture checkpoint

The GameDay junior work established several important architectural facts:

- provider IDs are useful for stable source identity;
- canonical identity must remain separate;
- competitions and seasons must be separate entities;
- team participation belongs at the season/group level;
- membership may be discovered differently by different competition types;
- source anomalies must be explicitly excluded rather than normalized into false data;
- provider integrity can be audited end-to-end;
- normalized data should hide provider-specific discovery mechanisms.

The current U10-U19 dataset should therefore be treated as a successful architecture experiment whose lessons now need to be consolidated into reusable platform code.

---

## 25. Cleanup direction

The next repository cleanup should aim to:

1. preserve canonical data and curated knowledge;
2. preserve the validated GameDay ingestion behaviour;
3. remove or archive obsolete exploratory U14 tooling;
4. move reusable provider logic out of large top-level scripts;
5. make `scripts/` thin entrypoints;
6. unify U10 and U12-U19 into one normalized junior provider model;
7. separate raw provider snapshots from normalized snapshots;
8. reduce permanent commands to reusable workflows;
9. keep generated proposals and resolution artifacts clearly separate from canonical data;
10. document provider-specific behaviour close to provider code.

Cleanup should not change canonical meaning merely to reduce file count.

---

## 26. Decision rule for future work

Before adding a new schema, script, provider or abstraction, ask:

### Is this canonical hockey knowledge?

If yes, it probably belongs in `data/` and `schema/`.

### Is this logic specific to a reusable external source?

If yes, it probably belongs in `providers/`.

### Is this generic resolution/import/audit logic?

If yes, it probably belongs in `pipeline/`.

### Is this a one-off historical source?

If yes, it probably belongs in `research/` and should use generic ingestion tooling.

### Is this only a temporary experiment or diagnostic?

If yes, it should not automatically become permanent architecture.

### Is this needed only by the website UI?

If yes, it probably does not belong in this repository.

---

## 27. North star

The platform succeeds when adding knowledge becomes easier as the dataset grows.

In the long term, adding:

- a new season;
- an old historical league;
- a newly discovered team;
- a renamed organisation;
- a rink;
- a shop;
- a synthetic ice facility;

should primarily require supplying evidence and making domain decisions, not writing another bespoke ingestion pipeline.

The canonical dataset is the product.

Scrapers, APIs, agents and import scripts are tools used to maintain it.
