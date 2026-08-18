# Import pipeline

External data must pass through a raw snapshot before becoming canonical Bytor data.

```text
external source
      ↓
scraper
      ↓
imports/
      ↓
normalisation
      ↓
entity resolution
      ↓
canonical data/
```

Rules

- Scrapers must preserve source terminology.
- Scrapers must not generate canonical Bytor entity IDs.
- Raw snapshots must not be manually corrected.
- Canonical entities must reference source provenance.
- Entity resolution happens after scraping.
- Ambiguous matches must not be resolved automatically.
- Existing canonical records must not be silently overwritten.
- Importers must be deterministic.
