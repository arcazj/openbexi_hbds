# Satellite Models

The Models and Edit workspaces include two satellite models:

- `models/satellite_world_simple_structure.json`: the default, derived from the local files in `data/space/json/`, rechecked on 27 September 2026.
- `models/satellite_world_complete_structure2.json`: the existing complete domain model, preserved without changes.

The other existing models remain available. Only `satellite_world_complete_structure.json` and `satellite_world_simple_structure_v2.json` were removed.

The simple model describes data structures with 11 classes, 3 visual hyperclasses, and 14 links. A deeper audit of all 32 source files added explicit **Decay Record** and **Refresh Status** classes. The [audit findings and complete file coverage](SPACE_DATA_AUDIT.md) explain the redesign, conflicts, join rules, metadata semantics and deliberate omissions. Individual catalog records stay in the source datasets. The diagram loads without those datasets; it does not import them or propagate satellite orbits.

## Source Mapping

The September 27 review read all 32 files, including all six metadata sidecars.
The source hashes and audit results were unchanged, so the existing 11 classes,
3 hyperclasses, 84 attributes, and 14 relationships still describe this snapshot.
The update improves the saved hierarchy, labels, and arrow visibility while
preserving identifiers, relationship directions, cardinalities, and source mappings.
The profile-to-payload verb **owns** means containment of the nested `payload`
object. **May use** retains the conditional profile-to-display association;
**is recorded in** identifies a historical decay record. These labels do not
assert legal ownership, verified profile identity, or future decay predictions.

Each attribute carries `sourceFields`. The prefix identifies an entry in `metadata.sourceDatasets`; the remaining path is relative to that dataset's record selector. `tracked:@manifest` addresses the tracked manifest; `tracked:@chunk` addresses chunk wrapper metadata; `display:@document` addresses asset-document metadata. Other paths address selected records. Grouped attributes retain related source fields and nested containers for a compact diagram. Every link has `sourceEvidence` describing its fields, relationship kind, join rule and observed cardinality. These extensions document provenance; they do not implement database joins.

| Class | Sources | Main fields |
| --- | --- | --- |
| Space Object | `satcat.csv`, tracked chunks, GP and TLE | NORAD/Alpha-5 IDs, internal object ID, international designator, object type, owner, radar cross-section, feed tags |
| Launch Record | Tracked chunks, SATCAT, launches, launch-date sidecar, GP and TLE | Source-specific launch dates, site, identity and details/orbit flags; conflicting dates retain provenance |
| Decay Record | `decayed/decayed.json` and nonempty tracked/SATCAT, launches and GP decay dates | Identity, object type, recorded decay date, recorded launch information; broader tracked coverage includes debris and rocket bodies |
| Tracking State | Tracked chunks, SATCAT, GP and launches | Independent lifecycle, operational, catalog membership, observation, element-availability and propagation statuses, element references |
| Orbital Elements | `gp/GP.json`, `tle/TLE.json` | OMM object, epoch, frame, time scale, propagation theory, TLE lines |
| Orbit Summary | Tracked chunks, GP and TLE | Orbit class, classification source, inclination, eccentricity, mean motion, period, perigee, apogee |
| Dataset Snapshot | Tracked manifest, chunk wrappers and metadata sidecars | Revisions, lineage, current/history scope, coverage, invariants, taxonomy, chunks, quarantine, newest dates and scientific boundary |
| Refresh Status | All six metadata sidecars | Attempt/success/fetch/reconcile times, status/error, source health, requested/verified scope, compatibility, counters, enrichment and retrieval details |
| Spacecraft Profile | `satellites/*.json` | Identity, bus, manufacturer, mass, launch vehicle, profile orbit, attitude, footprints |
| Payload Profile | Nested `payload` in spacecraft profiles | Transponders, beams, bandwidth, polarization, frequency bands |
| Display Asset | `display_satellite_models.json` | Asset ID, display name, format, files, textures, tags |

The inspected snapshots contain 70,661 tracked records (35,091 current and 35,570 historical), 16,470 GP records, 16,015 TLE records, 27,713 launch records, 7,636 decay records, 23,891 launch-date entries, 7 spacecraft profile files, and 6 display assets. These are overlapping collections with different dates and coverage; their counts must not be added together as distinct objects. Source file checksums are recorded in the model metadata where a dataset has a single file.

## Interpretation

- Normalize NORAD IDs as strings for joins. SATCAT `OBJECT_ID` is an international designator; normalized `object_id` is an internal `obx:norad:` identifier.
- Object types include payloads, debris, rocket bodies, mission-related objects, and unknown objects. The catalog is broader than satellites.
- Lifecycle, observation, and element availability are independent. Current catalog membership does not imply current orbital elements or an operational spacecraft.
- The GP snapshot uses OMM; its TLE fields are null. The separate TLE feed supplies line pairs. SATCAT summaries can exist without propagatable elements.
- The GP metadata reports a failed refresh and degraded status. The model records the local structure and does not assert that all sources are current.
- Profile files include examples, templates, zero IDs, and placeholders. Dashed links denote a conditional catalog join and a curated display association; neither establishes a verified foreign key from every profile.
- Decay is visible as a recorded assertion, not a prediction or reentry event. The standalone feed has 7,636 payload records; tracked history has 35,570 decayed objects of several types. Name buckets are not identities.
- Fifty launch-date sidecar values conflict with tracked dates. The OneWeb profile ID resolves to PRISMA; OneWeb and Starlink V1 profile dates conflict with catalog dates. Source data remains unchanged and profile joins stay unverified.
- `CURRENT`/`HISTORICAL` partition scope is independent of catalog membership: every supplied tracked record is `PRESENT`. Historical chunks are not a time-series event history.
- Only `physical_size_estimate` and `rcs_size` are omitted from visible source mappings; both are null throughout the tracked records. Detailed OMM, beam, contour, retrieval and reconciliation fields are grouped in object attributes.
- `rcs_m2` is radar cross-section, not physical size. Empty or missing source values remain unknown.
- Hyperclasses provide visual grouping under structural profile v1. They do not assert executable inheritance or semantic membership.

## Validation

Run `py -3.9 -B scripts/check_project.py` for model, helper, server, and browser checks. The browser suite checks that Decay Record is visible, loads both satellite models, and tests editing, saving, and reloading temporary copies, including preservation of source mappings, record filters and relationship evidence. It also exercises the existing test fixtures, which remain in `test_models/`.

Run `py -3.9 -B tools/audit_space_data.py --output doc/SPACE_DATA_AUDIT.json` to repeat the source audit. It reads every file, verifies chunk hashes/sizes/counts and tracked aggregate counts, checks attribute and relationship field references, and reports joins, conflicts and unmapped fields. The [JSON report](SPACE_DATA_AUDIT.json) records the inspected local snapshot and should be regenerated after source data changes.

For focused satellite loading, saving, zoom, and visual checks, run `py -3.9 -B scripts/check_project.py --browser-only --browser-suite satellite`.

The raw `data/` directory is local working data and is not required for the published diagram or regression suite.
