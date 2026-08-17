# Bytor Hockey Data

Structured ice hockey data for the Bytor Hockey project.

The goal of this repository is to build a reliable, source-backed dataset describing the UK ice hockey ecosystem, including recreational, senior, junior, university and women's hockey.

The database is designed to support the Bytor Hockey website, research, statistics, discovery tools and AI-assisted data analysis.

## Scope

The project will eventually cover:

- teams and clubs
- ice rinks
- leagues and competitions
- recreational hockey
- senior hockey
- junior hockey
- women's hockey
- university hockey (BUIHA)
- tournaments and recurring events
- organisations and governing bodies
- historical seasons and participation
- relationships between teams, competitions, organisations and venues

The initial dataset currently focuses on EIHA recreational hockey.

## Data principles

### Source-backed

Canonical records retain information about where their data originated.

Sources are stored separately from the entities they support.

### Raw data is immutable

Scraped or imported source data is stored under `imports/` as snapshots.

It should not be manually corrected to match what we believe the source intended to say.

Corrections, normalization and enrichment belong in the canonical dataset.

### Canonical IDs are independent

Bytor uses its own stable entity IDs.

Identifiers belonging to EIHA Rec and future external systems are stored as external IDs rather than being used as canonical identifiers.

### Unknown is better than guessed

Missing or uncertain information should remain unknown until it can be established from appropriate evidence.

Importers should be deterministic and should not infer facts merely because they appear likely.

### Validation is part of the database

The repository validates both individual records and relationships between records.

For example, a team cannot reference a rink that does not exist in the canonical dataset.

## Repository structure

```text
bytor-hockey-data/
├── ai/             # AI-related instructions and tooling
├── data/           # Canonical structured data
│   ├── organisations/
│   ├── rinks/
│   ├── sources/
│   └── teams/
├── generated/      # Generated outputs
├── imports/        # Immutable snapshots of external datasets
├── research/
│   └── inbox/      # Material awaiting investigation/processing
├── schema/         # Zod schemas and domain model
├── scripts/        # Import, validation and data tooling
└── sources/        # Source-related supporting material
```

## Current data

The first imported dataset comes from the EIHA Recreational Ice Hockey website.

Current canonical data includes:

- EIHA Rec teams
- EIHA Rec rinks
- team-to-rink relationships
- external EIHA Rec identifiers
- source provenance
- available team contact, training, website and logo information

Raw EIHA Rec snapshots are preserved separately from canonical records.

## Commands

Install dependencies:

```bash
pnpm install
```

Type-check the project:

```bash
pnpm typecheck
```

Validate canonical data and relationships:

```bash
pnpm validate
```

Run the data quality audit:

```bash
pnpm data-audit
```

Import EIHA Rec rinks:

```bash
pnpm import:eiharec:rinks
```

Import EIHA Rec teams:

```bash
pnpm import:eiharec:teams
```

## Validation

Canonical YAML records are validated with Zod.

Validation currently checks:

- schema correctness
- team-to-rink references
- entity-to-source references
- uniqueness of external IDs within entity types

Import scripts resolve external identifiers to canonical Bytor IDs rather than creating relationships from names.

## Data pipeline

```text
External source
      ↓
Raw snapshot
imports/
      ↓
Deterministic importer
      ↓
Canonical data
data/
      ↓
Schema + integrity validation
      ↓
Generated datasets / applications / analysis
```

AI-assisted research may contribute to later enrichment and investigation, but uncertain AI-generated conclusions should not silently become canonical facts.

## Status

Early development.

The current EIHA Rec dataset is the first foundation of a broader UK hockey knowledge base. The domain model will expand as additional real-world datasets are introduced rather than attempting to model the entire hockey ecosystem upfront.

## Bytor Hockey

This repository is part of the Bytor Hockey project.
