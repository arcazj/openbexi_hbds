# Satellite Models

The Models and Edit workspaces include two satellite models:

- `models/satellite_world_simple_structure.json`: the default, derived from the local files in `data/space/json/` inspected on 26 September 2026.
- `models/satellite_world_complete_structure2.json`: the existing complete domain model, preserved without changes.

The other existing models remain available. Only `satellite_world_complete_structure.json` and `satellite_world_simple_structure_v2.json` were removed.

The simple model describes data structures with 9 classes, 3 visual hyperclasses, and 11 links. Individual catalog records stay in the source datasets. The diagram loads without those datasets; it does not import them or propagate satellite orbits.

## Source Mapping

Each attribute carries `sourceFields`. The prefix identifies an entry in `metadata.sourceDatasets`; the remaining path is relative to that dataset's record selector. `tracked:@manifest` addresses the tracked manifest itself. Other `tracked` fields address records in its current and historical chunks. Grouped attributes combine related source fields for a compact diagram.

| Class | Sources | Main fields |
| --- | --- | --- |
| Space Object | `satcat.csv`, tracked chunks, GP and TLE | NORAD ID, internal object ID, international designator, object type, owner, radar cross-section |
| Launch / Lifecycle | Tracked chunks, `launches/launches.json`, `decayed/decayed.json`, `tle/satellite_launch_dates.json` | Launch and decay dates, launch site, lifecycle and operational status |
| Tracking State | Tracked chunks | Catalog membership, observation status, current-element availability, propagation status, metadata-only status |
| Orbital Elements | `gp/GP.json`, `tle/TLE.json` | OMM object, epoch, frame, time scale, propagation theory, TLE lines |
| Orbit Summary | Tracked chunks, GP and TLE | Orbit class, classification source, inclination, eccentricity, mean motion, period, perigee, apogee |
| Dataset Snapshot | `tracked/TRACKED.manifest.json`, `*.meta.json` sidecars | Revisions, timestamps, refresh status, provenance, coverage, chunks, quarantine |
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
- `rcs_m2` is radar cross-section, not physical size. Empty or missing source values remain unknown.
- Hyperclasses provide visual grouping under structural profile v1. They do not assert executable inheritance or semantic membership.

## Validation

Run `py -3.9 -B scripts/check_project.py` for model, helper, server, and browser checks. The browser suite loads both satellite models and tests editing, saving, and reloading temporary copies. It also exercises the existing test fixtures, which remain in `test_models/`.

For focused satellite loading, saving, zoom, and visual checks, run `py -3.9 -B scripts/check_project.py --browser-only --browser-suite satellite`.

The raw `data/` directory is local working data and is not required for the published diagram or regression suite.
