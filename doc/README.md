# HBDS Source And Documentation Catalog

This directory contains project-authored specifications. A locally supplied historical PDF corpus may also be present; it is excluded from the published repository. The catalog records what is known from file metadata and inspection; it does not establish ownership or permission to redistribute the PDFs.

## Project Documentation

- [Server and AI setup](SERVER_AND_AI.md): local modes, saving, provider configuration, collaboration, and API access.
- [Layout and optimization](LAYOUT_OPTIMIZATION.md): layout algorithms, link separation, attribute spacing, and font behavior.
- [OpenBEXI Timeline model](OPENBEXI_TIMELINE_MODEL.md): conceptual classes, relationships, source coverage, and the current diagram.
- [OpenBEXI Timeline recreation prompt](../prompts/openbexi_timeline_prompt.MD): application requirements and inspected contracts for rebuilding the companion Timeline app.
- [HBDS Structural Diagram Profile v1](HBDS_STRUCTURAL_DIAGRAM_PROFILE_V1.md): normative current JSON/rendering contract.
- [HBDS Support Matrix](HBDS_SUPPORT_MATRIX.md): implemented, opt-in semantic, and unsupported capabilities.
- [HBDS Glossary](HBDS_GLOSSARY.md): terminology used by theory, schemas, and UI.
- [HBDS Modeling Tutorial](HBDS_MODELING_TUTORIAL.md): conservative class/link modeling workflow.
- [Schema And Instance Examples](HBDS_SCHEMA_EXAMPLES.md): v1 and additive v2 examples.
- [v1 JSON Schema](../schemas/hbds-structural-diagram-profile-v1.schema.json)
- [additive v2 JSON Schema](../schemas/hbds-semantic-profile-v2.schema.json)

## Historical PDF Corpus

### Provenance Status

The chapter PDFs report PDF metadata author `François` and creator `PDFCreator Version 1.2.3`. Their first pages identify an applied geomatics/information-technology course, but the files do not contain enough machine-readable metadata to establish the author's full legal identity, publication institution, publication date, source URL, or redistribution license.

The application Help text attributes HBDS to François Bouillé. That statement should be supported by a primary source before it is used as the provenance record for these particular files.

`uml_vs_hbds(1).pdf` is different material. Its first page names Stéphane Pelle and is dated 14 May 2001; extracted text references a UML site by Laurent Piechocki. Its rights section must be reviewed before redistribution.

Until provenance is confirmed:

- license status is **unknown** for every PDF;
- repository licensing MUST NOT be assumed to cover these PDFs;
- do not publish or redistribute them as project-owned documentation;
- project-authored summaries should paraphrase and cite chapter/page locations rather than reproduce long passages;
- record any future permission, source URL, archive reference, and checksum in this catalog.

### Inventory

| Local file | PDF title metadata / inferred topic | Pages | SHA-256 prefix | Provenance/license |
| --- | --- | ---: | --- | --- |
| `10 - La structuration  le modele HBDS.pdf` | 10 - La structuration, le modèle HBDS | 16 | `0e1b9585a385` | Author metadata `François`; license unknown. |
| `10_1_-_TAD_de_base.pdf` | 10.1 - TAD de base | 63 | `847eed7d4d6d` | Author metadata `François`; license unknown. |
| `10_2_-_Les_foncteurs_de_base.pdf` | 10.2 - Les foncteurs de TAD | 53 | `464b78af4d61` | Author metadata `François`; license unknown. Preferred local name for the duplicate pair. |
| `10_2 - Les foncteurs de base_old.pdf` | Same byte content as the preceding 10.2 file | 53 | `464b78af4d61` | Exact duplicate; retain only if provenance workflow requires the alias. |
| `10_3 - Extensions - Embryons, prototypes et structures.pdf` | 10.3 - Extensions - Embryons, prototypes et structures | 23 | `279547441c92` | Author metadata `François`; license unknown. |
| `10_4 - Nouveaux foncteurs.pdf` | 10.4 - Nouveaux foncteurs | 26 | `b788132e05d7` | Author metadata `François`; license unknown. |
| `10_5 - Les divers prototypes.pdf` | 10.5 - Les divers prototypes | 23 | `9548bfb2478f` | Author metadata `François`; license unknown. |
| `10_6 - Relations entre reseaux - Superposition, intersection, emboitement.pdf` | 10.6 - Relations entre réseaux | 30 | `a3c6569f48c6` | Author metadata `François`; license unknown. |
| `10_7_-_Mecanismes_associatifs_entre_TAD.pdf` | 10.7 - Mécanismes associatifs entre TAD | 38 | `74353b61bcac` | Author metadata `François`; license unknown. |
| `10_8_-_La_manipulation_des_grandeurs_et_unites.pdf` | 10.8 - La manipulation des grandeurs et unités | 18 | `9a4500c3601a` | Author metadata `François`; license unknown. |
| `10_9_-_La_modelisation_du_flou.pdf` | 10.9 - La modélisation du flou | 28 | `a9d0880d0860` | Author metadata `François`; license unknown. |
| `10_11 - Methodologie de modelisation.pdf` | 10.11 - Méthodologie de modélisation | 27 | `2c2ed7557969` | Author metadata `François`; license unknown. |
| `10_12 - Les erreurs a eviter.pdf` | 10.12 - Les erreurs à éviter | 24 | `a6390ee3320e` | Author metadata `François`; license unknown. |
| `uml_vs_hbds(1).pdf` | UML/HBDS comparison and copied UML FAQ material | 24 | `ff591e57b16a` | Multiple named parties; rights review required. |

### Completeness And Naming Notes

- Chapter **10.10 is missing** from the local numeric sequence. It is unknown whether a 10.10 chapter exists, was intentionally skipped, or was not supplied.
- The two chapter 10.2 files are byte-identical, not revisions. Their full SHA-256 value is `464b78af4d61bab72f8b74c581599a175dcd5dc3f9ddba42e2a0f1b85bfc24e9`.
- File naming is inconsistent in spaces, accents, separators, and the `(1)` suffix. Do not rename source files until provenance links or citations have been recorded; use stable catalog IDs in future citations.
- No table of contents ties the UML comparison to the numbered chapter series.
- The PDFs are French-language source material. Project documentation should state the language and provide accessible summaries rather than implying that the app Help is a complete translation.

## Proposed Stable Citation IDs

Use `HBDS-10`, `HBDS-10.1`, through `HBDS-10.12`, and `HBDS-UML-2001` in project-authored notes. A citation should include the catalog ID, local filename, PDF page, and verified source URL when one becomes available.

Example:

```text
HBDS-10.6, "Relations entre réseaux", local PDF page 12; source URL and license not yet verified.
```

## Corpus Maintenance Checklist

1. Verify author identity and institutional provenance.
2. Record original publication/source URLs and dates.
3. Obtain or document redistribution permission.
4. Resolve whether chapter 10.10 exists.
5. Remove or quarantine the duplicate 10.2 alias after citations are stable.
6. Add searchable, accessible summaries with page-level citations.
7. Keep checksums so later replacements are detectable.
