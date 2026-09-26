# Space Data Audit Findings

Audit date: 26 September 2026. All findings describe the supplied files in `data/space/json/`; no upstream source was refreshed. The [JSON audit](SPACE_DATA_AUDIT.json) contains exact paths, byte hashes, full metadata, field inventories, joins and all conflicting launch dates. The [model guide](SATELLITE_MODEL_SOURCES.md) describes how the diagram uses them.

## Why the Model Changed

The previous model hid decay as a date attribute in Launch / Lifecycle. It also mixed refresh health with dataset identity and did not expose all scope, compatibility, lineage and conflict information. The redesign adds **Decay Record** and **Refresh Status**, renames the launch projection to **Launch Record**, and moves lifecycle/operational status into **Tracking State**. Dataset Snapshot now explicitly groups scope, coverage, invariants, taxonomy, quarantine, provenance and source limits. The diagram remains a structure model with 11 classes; thousands of individual objects are not rendered as nodes.

## Decay Coverage

The standalone decay file has **7,636 records**, all source type `PAY`, grouped into **7,478 names**. There are **43 multi-record name buckets** but no duplicate NORAD IDs. Sidecar `counts.objects` therefore counts names, not distinct catalog identities. Names must not be used as join keys.

Tracked history contains **35,570 objects with recorded decay dates**:

| Normalized type | Records |
| --- | ---: |
| Payload | 7,636 |
| Debris | 23,357 |
| Rocket body | 4,466 |
| Unknown | 111 |
| Mission-related | 0 |

All 7,636 payload decay dates agree with tracked data. The standalone feed does not cover the other **27,934** decayed objects. Decay Record consequently maps both the standalone feed and nonempty decay dates in tracked/SATCAT records. It retains object identity, type, launch information and a relationship to the source snapshot.

Within one source snapshot, an object has zero or one recorded decay-date assertion. Several sources can repeat that assertion; they do not establish multiple physical decay events. The files do not supply a decay forecast, precise reentry timestamp, location or uncertainty model, so those are not invented.

## Metadata and Data Quality Findings

1. **Configured GP scope is not verified coverage.** GP requests `active` and three debris groups but reports `source_scope_verified=false`, `last_status=failed` and `source_status=DEGRADED`. Its last-known-good `catalog_source_groups` contains only `active`. TRACKED lineage also names `active`. A verified tracked snapshot does not establish that all requested debris orbital data was fetched successfully.
2. **Membership, lifecycle and orbital availability differ.** All 70,661 tracked records have membership `PRESENT`, including all 35,570 historical decayed records. There are 16,436 records with current elements and 54,225 metadata-only records. Of the 16,470 GP rows, 34 match decayed objects; a NORAD match alone does not enable propagation.
3. **Timestamps have different meanings.** GP's last attempt is 14 September, last success is 30 August, and newest orbital epoch is 7 September. Build, fetch, enrichment, reconciliation, epoch and success times remain separate. The audit does not repair or reconcile this chronology.
4. **The TLE feed is compatibility data.** Its sidecar explicitly sets `deprecated_compatibility=true`. GP contains OMM with null TLE lines; the separate TLE feed supplies line pairs. TLE `source_status=COMPLETE` describes that feed, not all configured GP groups or all physical objects.
5. **There are 50 conflicting launch-date assertions.** For example, NORAD 57726 has `1991-05-16` in the launch-date sidecar and `1974-04-24` in tracked data. All 50 pairs are recorded in the JSON report. The audit identifies disagreement without asserting which source is correct.
6. **Profile references are not reliable foreign keys.** `oneweb.json` uses NORAD 44072, which the catalog calls `PRISMA`; its date is `2019-02-27`, versus catalog `2019-03-22`. `starlink_V1.json` uses NORAD 44713 (`STARLINK-1007`) but supplies `2019-05-24`, versus catalog `2019-11-11`. Zero IDs and placeholders are rejected as identities. Profiles remain unverified even where some fields match.
7. **Reported revisions are not automatically file byte hashes.** All 11 chunk descriptors match their byte hashes, sizes and counts. SATCAT, GP, TLE and launches sidecar dataset hashes match their corresponding file bytes. The decay sidecar hash differs from the exported decay file's byte hash. Without the producer's hash algorithm, that is an unresolved revision/checksum distinction, not proof of corruption. Tracked composite revisions are also kept separate from the manifest byte hash.
8. **Counters have local meanings.** Derived-feed `retained_history=0` is not the tracked historical object count. Decay `counts.objects=7478` describes name buckets. Null `expected_provider_records` and false `provider_completeness_claim` do not establish complete knowledge of physical space objects.
9. **Some field names are misleading without context.** `company` can be `ACTIVE`, so it is a feed/group tag, not a verified organization. SATCAT `OBJECT_ID` is an international designator; normalized `object_id` is an `obx:norad:` identity. There are 663 nonempty Alpha-5 aliases; they represent existing identities rather than additional objects. Radar cross-section is not physical size.

## Join Rules and Cardinalities

- Normalize positive decimal NORAD IDs as strings. Every inspected main feed has unique IDs and no IDs missing from tracked data. This is an observed snapshot property, not a universal constraint.
- Preserve source-specific dates and provenance when several feeds reference one object. Do not silently prefer one conflicting value.
- Tracking state and orbit summary are projections of fields within a record. Payload is a nested profile object. Manifest/chunk relationships follow file containment. Metadata relationships follow named sidecar conventions, not invented foreign-key columns.
- `CURRENT` and `HISTORICAL` describe chunk scope. Historical records here are decayed objects; they do not form a time-series event log. Both scopes can remain `PRESENT` in the provider catalog.
- A profile-to-catalog reference is an unverified candidate. A profile-to-display-asset relationship is a proposed presentation association: there is no supplied asset foreign key, and similar names do not establish one.
- Every diagram link records its relationship kind, source fields, join rule and observed cardinality in `sourceEvidence`.

## Deliberate Simplifications

Every observed source field is mapped directly or within a named container attribute except `physical_size_estimate` and `rcs_size`, which are null in every tracked record. Those two fields remain in the audit inventory. Detailed OMM parameters, beam/contour data, HTTP headers, reconciliation counters and taxonomy are grouped instead of becoming dozens of diagram nodes.

The empty quarantine file does not establish a rejected-record schema. Empty mission-related partitions declare a taxonomy category, not evidence of actual records. Launch rows describe objects, not distinct launch missions. There is no supplied refresh-event history, observation time series, verified profile-asset foreign key, or decay-prediction dataset. Profile altitude and attitude units without explicit declarations remain unverified. Visual hyperclasses do not assert executable HBDS inheritance or membership.

## Reproduce the Audit

```powershell
py -3.9 -B tools/audit_space_data.py --output doc/SPACE_DATA_AUDIT.json
py -3.9 -B scripts/check_project.py
```

The audit reads all source files, verifies chunk integrity and tracked aggregate counts, checks every modeled attribute/relationship field reference, and reports conflicts and omissions without changing source data. The checked-in report is a snapshot; regenerate it when source files change. Raw data is not required for normal model loading or the regression suite.

## Coverage of All 32 Files

The table below abbreviates content-hash chunk names with `…`. Exact filenames, nested fields, metadata and SHA-256 values are in the JSON report. Counts describe each file independently and must not be added as distinct objects across overlapping datasets.

| Source file | Records / role | Model coverage / interpretation |
| --- | ---: | --- |
| `decayed/decayed.json` | 7636 | Explicit Decay Record; all seven fields mapped, payload subset only. |
| `decayed/decayed.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
| `display_satellite_models.json` | 6 | Display Asset; base path/schema, files, textures, descriptions and tags. |
| `gp/GP.json` | 16470 | Identity and lifecycle assertions, Orbital Elements and Orbit Summary; OMM remains grouped. |
| `gp/GP.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
| `launches/launches.json` | 27713 | Object, launch and decay assertions, tracking flags; per-object records, not missions. |
| `launches/launches.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
| `satcat.csv` | 70661 | Space Object, Launch Record, Decay Record, Tracking State, Orbit Summary; all CSV columns mapped. |
| `satcat.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
| `satellites/0.json` | 1 | Spacecraft Profile / Payload Profile. Placeholder zero ID. |
| `satellites/ISS.json` | 1 | Spacecraft Profile / Payload Profile. Matching local ID/designator; empty subobjects preserved. |
| `satellites/O3b.json` | 1 | Spacecraft Profile / Payload Profile. Alternate field nesting, footprints and placeholder band/beam names. |
| `satellites/oneweb.json` | 1 | Spacecraft Profile / Payload Profile. Catalog identity/date conflict. |
| `satellites/satellite_template.json` | 1 | Spacecraft Profile / Payload Profile. Template values, not observations. |
| `satellites/starlink_V1.json` | 1 | Spacecraft Profile / Payload Profile. Representative profile with conflicting launch date. |
| `satellites/starlink_v2.json` | 1 | Spacecraft Profile / Payload Profile. Representative profile; matching ID/date does not verify all parameters. |
| `tle/satellite_launch_dates.json` | 23891 | Space Object / Launch Record; all 50 conflicting dates remain in the audit. |
| `tle/TLE.json` | 16015 | Identity, launch assertions, Orbital Elements and Orbit Summary; compatibility feed. |
| `tle/TLE.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
| `tracked/chunks/…-quarantine.json` | 0 | Snapshot quarantine descriptor; empty record schema remains unknown. |
| `tracked/chunks/…-current-mission-related.json` | 0 | Declared empty partition in Snapshot taxonomy and coverage. |
| `tracked/chunks/…-historical-mission-related.json` | 0 | Declared empty partition in Snapshot taxonomy and coverage. |
| `tracked/chunks/…-historical-payload.json` | 7636 | Object, launch and tracking projections, explicit decay assertions; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-historical-rocket-body.json` | 4466 | Object, launch and tracking projections, explicit decay assertions; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-current-unknown.json` | 55 | Object, launch and tracking projections; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-current-debris.json` | 12531 | Object, launch and tracking projections; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-historical-debris.json` | 23357 | Object, launch and tracking projections, explicit decay assertions; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-current-rocket-body.json` | 2428 | Object, launch and tracking projections; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-current-payload.json` | 20077 | Object, launch and tracking projections; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/chunks/…-historical-unknown.json` | 111 | Object, launch and tracking projections, explicit decay assertions; wrapper schema/scope/type map to Dataset Snapshot. |
| `tracked/TRACKED.manifest.json` | manifest | Dataset Snapshot; scope, coverage, invariants, taxonomy, provenance and descriptors. |
| `tracked/TRACKED.meta.json` | metadata | Dataset Snapshot / Refresh Status; all metadata fields mapped, including nested counters and retrieval details. |
