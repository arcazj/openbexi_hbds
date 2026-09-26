#!/usr/bin/env python3
"""Audit every local space data file without changing the source datasets.

The optional JSON output records inventories, joins, metadata and model coverage.
Reported revisions are kept distinct from checksums of the supplied file bytes.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def field_paths(value, prefix=""):
    """Include containers and nested fields; [] denotes array elements."""
    found = set()
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else key
            found.add(path)
            found.update(field_paths(child, path))
    elif isinstance(value, list):
        for child in value:
            found.update(field_paths(child, prefix + "[]"))
    return found


def fields_in(records):
    fields = set()
    for record in records:
        fields.update(field_paths(record))
    return fields


def distribution(records, field):
    return dict(sorted(Counter(str(row.get(field)) for row in records).items()))


def norad(value):
    raw = str(value).strip()
    return str(int(raw)) if raw.isdecimal() and int(raw) > 0 else None


def join_audit(records, key, tracked, date_field=None):
    ids = [norad(row.get(key)) for row in records]
    usable = [value for value in ids if value is not None]
    missing = sorted(set(usable) - tracked.keys())
    conflicts = []
    if date_field:
        for row, identity in zip(records, ids):
            if identity not in tracked:
                continue
            supplied = row.get(date_field)
            expected = tracked[identity].get("launch_date")
            if supplied and expected and supplied[:10] != expected:
                conflicts.append({"noradId": identity, "sourceDate": supplied, "trackedDate": expected})
    return {
        "records": len(records), "uniqueIds": len(set(usable)),
        "invalidIds": len(ids) - len(usable), "duplicateIds": len(usable) - len(set(usable)),
        "unmatchedIds": missing, "launchDateConflicts": conflicts,
    }


def audit(source_root: Path, model_path: Path):
    source_root = source_root.resolve()
    paths = sorted(path for path in source_root.rglob("*") if path.is_file())
    documents, hashes, sizes = {}, {}, {}
    for path in paths:
        relative = path.relative_to(source_root).as_posix()
        raw = path.read_bytes()
        hashes[relative] = hashlib.sha256(raw).hexdigest()
        sizes[relative] = len(raw)
        if path.suffix.lower() == ".json":
            documents[relative] = json.loads(raw.decode("utf-8-sig"))
        elif path.suffix.lower() == ".csv":
            with path.open(encoding="utf-8-sig", newline="") as handle:
                documents[relative] = list(csv.DictReader(handle))
        else:
            raise ValueError(f"Unrecognized source file requires review: {relative}")

    manifest = documents["tracked/TRACKED.manifest.json"]
    chunks, tracked = [], []
    for descriptor in manifest["chunks"] + manifest["history_chunks"] + [manifest["quarantine"]]:
        relative = descriptor["path"].removeprefix("json/")
        if relative not in documents:
            raise ValueError(f"Missing or out-of-root chunk: {relative}")
        rows = documents[relative]["records"]
        valid = (len(rows) == descriptor["count"] and sizes[relative] == descriptor["bytes"]
                 and hashes[relative] == descriptor["sha256"].removeprefix("sha256:"))
        if not valid:
            raise ValueError(f"Chunk checksum, byte size or record count mismatch: {relative}")
        scope = descriptor.get("scope", "QUARANTINE")
        chunks.append({"path": relative, "scope": scope, "type": descriptor.get("object_type"),
                       "records": len(rows), "sha256Verified": True,
                       "decayDates": sum(bool(row.get("decay_date")) for row in rows)})
        if scope != "QUARANTINE":
            tracked.extend(rows)

    decay_groups = documents["decayed/decayed.json"]
    decayed = [row for group in decay_groups.values() for row in group]
    profile_paths = sorted(name for name in documents if name.startswith("satellites/"))
    metadata = {name: doc for name, doc in documents.items() if name.endswith(".meta.json")}
    datasets = {
        "tracked": tracked, "satcat": documents["satcat.csv"], "decayed": decayed,
        "launches": documents["launches/launches.json"], "launch_dates": documents["tle/satellite_launch_dates.json"],
        "gp": documents["gp/GP.json"], "tle": documents["tle/TLE.json"],
        "profiles": [row for name in profile_paths for row in documents[name].values()],
        "display": documents["display_satellite_models.json"]["models"], "refresh": list(metadata.values()),
    }
    tracked_by_id = {norad(row["norad_id"]): row for row in tracked}
    joins = {}
    for key in ("tracked", "satcat", "decayed", "launches", "launch_dates", "gp", "tle"):
        identity = "NORAD_CAT_ID" if key in ("satcat", "decayed") else "norad_id"
        date = "LAUNCH_DATE" if key in ("satcat", "decayed") else "launch_date"
        joins[key] = join_audit(datasets[key], identity, tracked_by_id, date)

    profiles = []
    for name in profile_paths:
        for row in documents[name].values():
            profile_meta = row.get("meta", {})
            identity = norad(profile_meta.get("norad_id"))
            target = tracked_by_id.get(identity)
            profiles.append({"file": name, "profileName": row["name"], "noradId": identity,
                             "catalogName": target.get("name") if target else None,
                             "sourceLaunchDate": profile_meta.get("launch_date"),
                             "catalogLaunchDate": target.get("launch_date") if target else None,
                             "sourceDesignator": profile_meta.get("cospar_id"),
                             "catalogDesignator": target.get("international_designator") if target else None})

    model = json.loads(model_path.read_text(encoding="utf-8"))
    observed = {name: fields_in(rows) for name, rows in datasets.items()}
    observed["tracked"].update("@manifest." + name for name in field_paths(manifest))
    for name, document in documents.items():
        if name.startswith("tracked/chunks/"):
            observed["tracked"].update("@chunk." + field for field in field_paths({
                key: value for key, value in document.items() if key != "records"
            }))
    observed["display"].update("@document." + name for name in field_paths({
        key: value for key, value in documents["display_satellite_models.json"].items() if key != "models"
    }))
    mapped = {name: set() for name in observed}
    for node in model["hypergraph"]["class"]:
        for attribute in node.get("attributes", []):
            for reference in attribute.get("sourceFields", []):
                dataset, field = reference.split(":", 1)
                if dataset not in observed or field not in observed[dataset]:
                    raise ValueError(f"Model references an unobserved field: {reference}")
                mapped[dataset].add(field)
    for link in model["hypergraph"]["link"]:
        for reference in link.get("sourceEvidence", {}).get("sourceFields", []):
            dataset, field = reference.split(":", 1)
            if dataset not in observed or field not in observed[dataset]:
                raise ValueError(f"Relationship references an unobserved field: {reference}")
    coverage = {}
    for dataset, fields in observed.items():
        unmapped = sorted(field for field in fields if not any(
            field == path or field.startswith(path + ".") or field.startswith(path + "[]")
            or path.startswith(field + ".") or path.startswith(field + "[]") for path in mapped[dataset]))
        coverage[dataset] = {"observedFieldCount": len(fields), "mappedFields": sorted(mapped[dataset]),
                             "unmappedFields": unmapped}

    inventory = []
    for name, document in documents.items():
        if name.startswith("tracked/chunks/"):
            rows = document["records"]
        elif name.startswith("satellites/"):
            rows = list(document.values())
        elif name == "decayed/decayed.json":
            rows = decayed
        elif name == "display_satellite_models.json":
            rows = document["models"]
        else:
            rows = document if isinstance(document, list) else [document]
        inventory.append({"path": name, "bytes": sizes[name], "sha256": hashes[name], "records": len(rows),
                          "wrapperFields": sorted(document.keys()) if isinstance(document, dict)
                          and name != "decayed/decayed.json" else [],
                          "recordFields": sorted(fields_in(rows))})

    historical = [row for row in tracked if row.get("decay_date")]
    current = [row for descriptor in manifest["chunks"]
               for row in documents[descriptor["path"].removeprefix("json/")]["records"]]
    actual_counts = {
        "total": len(tracked), "current": len(current), "historical": len(historical),
        "propagatable": sum(bool(row.get("has_current_elements")) for row in tracked),
        "metadata_only": sum(bool(row.get("metadata_only")) for row in tracked),
        "object_types": distribution(tracked, "object_type"),
        "lifecycle_statuses": distribution(tracked, "lifecycle_status"),
    }
    count_checks = {}
    for key, actual in actual_counts.items():
        reported = manifest["counts"][key]
        # Zero-valued declared taxonomy members need not appear in the records.
        if isinstance(actual, dict):
            actual = {**{name: 0 for name in reported}, **actual}
        count_checks[key] = actual == reported
    if not all(count_checks.values()):
        raise ValueError(f"Tracked manifest counts disagree with records: {count_checks}")
    gp_ids = {norad(row["norad_id"]) for row in datasets["gp"]}
    sidecar_byte_hash = {}
    for sidecar, data_name in (("satcat.meta.json", "satcat.csv"), ("gp/GP.meta.json", "gp/GP.json"),
                               ("tle/TLE.meta.json", "tle/TLE.json"), ("launches/launches.meta.json", "launches/launches.json"),
                               ("decayed/decayed.meta.json", "decayed/decayed.json")):
        reported = metadata[sidecar].get("dataset_hash", "").removeprefix("sha256:")
        sidecar_byte_hash[sidecar] = {"reportedDatasetHash": reported, "fileSha256": hashes[data_name],
                                    "matchesFileBytes": reported == hashes[data_name]}

    return {
        "sourceRoot": "data/space/json", "fileCount": len(inventory), "inventory": inventory,
        "metadata": metadata, "trackedManifest": manifest, "chunkChecks": chunks,
        "trackedCountChecks": count_checks,
        "joinsToTracked": joins, "profiles": profiles, "sourceFieldCoverage": coverage,
        "sidecarByteHashComparisons": sidecar_byte_hash,
        "decay": {"feedRecords": len(decayed), "nameBuckets": len(decay_groups),
                  "multiRecordNameBuckets": sum(len(rows) > 1 for rows in decay_groups.values()),
                  "feedObjectTypes": distribution(decayed, "OBJECT_TYPE"),
                  "trackedDecayRecords": len(historical), "trackedDecayTypes": distribution(historical, "object_type"),
                  "dateConflicts": sum(row["DECAY_DATE"] != tracked_by_id[norad(row["NORAD_CAT_ID"])]["decay_date"]
                                       for row in decayed if norad(row["NORAD_CAT_ID"]) in tracked_by_id)},
        "tracking": {"distributions": {field: distribution(tracked, field) for field in (
            "lifecycle_status", "catalog_membership_status", "observation_status", "element_availability_status", "unavailable_reason")},
            "gpRecordsWithRecordedDecay": sum(norad(row["norad_id"]) in gp_ids for row in historical),
            "nullOnlyFields": sorted(key for key in fields_in(tracked)
                                     if "." not in key and all(key in row and row[key] is None for row in tracked))},
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=ROOT / "data/space/json")
    parser.add_argument("--model", type=Path, default=ROOT / "models/satellite_world_simple_structure.json")
    parser.add_argument("--output", type=Path, help="Write an audit report outside the source data directory")
    args = parser.parse_args()
    if args.output:
        output = args.output.resolve()
        if output == args.model.resolve() or args.source_root.resolve() in output.parents:
            parser.error("Audit output must not overwrite the model or source data")
    report = audit(args.source_root, args.model)
    if args.output:
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Audited {report['fileCount']} files; chunk integrity and model field references verified.")
    print(json.dumps({"decay": report["decay"], "launchDateConflicts": len(report["joinsToTracked"]["launch_dates"]["launchDateConflicts"]),
                      "unmappedFields": {key: item['unmappedFields'] for key, item in report['sourceFieldCoverage'].items()}}, indent=2))


if __name__ == "__main__":
    main()
