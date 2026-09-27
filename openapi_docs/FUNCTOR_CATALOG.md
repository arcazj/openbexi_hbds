# HBDS functor catalog

Version 1.0.0 • Semantic profile `bouille-http-v1`

All entries have a dedicated `POST /api/models/{modelName}/functors/NAME` operation, an exact request/response schema, a generic call schema, and synthetic examples in the OpenAPI document. Scoped model/test-model execution uses the generic endpoint with the same typed catalog. English descriptions are descriptive labels, **not invented expansions of the original acronyms**.

References identify the supplied chapter and 1-based PDF page; diagram-only labels were read from full landscape renderings. Optional transitive closure, HTTP encodings, stable IDs and revision handling are engineering choices.

## Base functors (37)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `ATT` | class | classAttribute | direct | CH10.2 / 8, 9, 10 |
| `PSC` | class | classLink | direct | CH10.2 / 11 |
| `NSC` | class | classLink | direct | CH10.2 / 12, 33 |
| `OBJ` | class | object | direct | CH10.2 / 13, 14 |
| `VATT` | classAttribute | objectAttribute | direct | CH10.2 / 15, 16 |
| `EFF` | classLink | objectLink | direct | CH10.2 / 17, 18 |
| `OATT` | object | objectAttribute | direct | CH10.2 / 19, 20, 21 |
| `OPSC` | object | objectLink | direct | CH10.2 / 22, 23 |
| `ONSC` | object | objectLink | direct | CH10.2 / 24 |
| `ATTOF` | classAttribute | class | inverse | CH10.2 / 25, 27 |
| `OBJOF` | object | class | inverse | CH10.2 / 25, 27 |
| `VATTOF` | objectAttribute | classAttribute | inverse | CH10.2 / 25, 27 |
| `OATTOF` | objectAttribute | object | inverse | CH10.2 / 25, 27 |
| `OINI` | objectLink | object | inverse | CH10.2 / 25, 27 |
| `OFIN` | objectLink | object | inverse | CH10.2 / 25, 27 |
| `EFFOF` | objectLink | classLink | inverse | CH10.2 / 25, 27 |
| `INI` | classLink | class | inverse | CH10.2 / 27, 28 |
| `FIN` | classLink | class | inverse | CH10.2 / 27, 28 |
| `INV` | classLink | classLink | homogeneous | CH10.2 / 29 |
| `OINV` | objectLink | objectLink | homogeneous | CH10.2 / 29 |
| `MLCOMP` | classLink | classLink | homogeneous | CH10.2 / 29 |
| `MLCOMPOF` | classLink | classLink | homogeneous | CH10.2 / 29 |
| `ACOMP` | classAttribute | classAttribute | homogeneous | CH10.2 / 30 |
| `ACOMPOF` | classAttribute | classAttribute | homogeneous | CH10.2 / 30 |
| `OACOMP` | objectAttribute | objectAttribute | homogeneous | CH10.2 / 30 |
| `OACOMPOF` | objectAttribute | objectAttribute | homogeneous | CH10.2 / 30 |
| `COUPLE` | class | classLink | multifunctor | CH10.2 / 33 |
| `OCOUPLE` | object | objectLink | multifunctor | CH10.2 / 33 |
| `PSCR` | class | classLink | multifunctor | CH10.2 / 34 |
| `NSCR` | class | classLink | multifunctor | CH10.2 / 34 |
| `OPSCR` | object | objectLink | multifunctor | CH10.2 / 35 |
| `ONSCR` | object | objectLink | multifunctor | CH10.2 / 35 |
| `OPSCC` | object | objectLink | multifunctor | CH10.2 / 36 |
| `ONSCC` | object | objectLink | multifunctor | CH10.2 / 36 |
| `OPSCRC` | object | objectLink | multifunctor | CH10.2 / 37 |
| `ONSCRC` | object | objectLink | multifunctor | CH10.2 / 37 |
| `OATTN` | object | objectAttribute | multifunctor | CH10.2 / 38, 39 |

### ATT

Return all class-attribute TADs belonging to the input classes.

### PSC

Return outgoing class links, not their target classes.

### NSC

Return incoming class links, not their source classes.

Source inconsistency CH102-NSC: page 12 first sentence says incoming, while its warning says outgoing and mentions objects. This API explicitly adopts the incoming class-link reading corroborated by COUPLE on page 33; it does not reproduce the conflicting warning.

### OBJ

Return all member objects of the input classes without filtering.

### VATT

Return object-attribute TADs corresponding to the input class attributes; not their values.

### EFF

Return object links realizing the input class links.

### OATT

Return all object-attribute TADs of the input objects, including attributes without a value.

### OPSC

Return outgoing object links without filtering relation or endpoint class.

### ONSC

Return incoming object links without filtering relation or endpoint class.

### ATTOF

Return the classes owning the input class attributes.

### OBJOF

Return the classes to which the input objects belong.

### VATTOF

Return the class attributes corresponding to the input object attributes.

### OATTOF

Return the objects owning the input object attributes.

### OINI

Return source objects of the oriented input object links.

### OFIN

Return target objects of the oriented input object links.

### EFFOF

Return the class links realized by the input object links.

### INI

Return source classes of the oriented input class links.

### FIN

Return target classes of the oriented input class links.

### INV

Return inverse orientations of the input class links.

### OINV

Return inverse orientations of the input object links.

### MLCOMP

Return class links composing the input multilinks.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### MLCOMPOF

Return multilinks containing the input class links, when any.

### ACOMP

Return immediate component class attributes of grouped attributes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### ACOMPOF

Return parent grouped class attributes containing the input attributes.

### OACOMP

Return immediate component object attributes of grouped object attributes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### OACOMPOF

Return parent grouped object attributes containing the input object attributes.

### COUPLE

Return class links directed from the prefix classes to targetClass; intersection of PSC(prefix) and NSC(targetClass).

Parameters: `targetClass`.

### OCOUPLE

Return object links directed from the prefix objects to targetObject.

Parameters: `targetObject`.

### PSCR

Return outgoing class links selected by relation.

Parameters: `relation`.

### NSCR

Return incoming class links selected by relation.

Parameters: `relation`.

The slide prose calls the incoming counterpart inverse. For HTTP catalog classification it remains a parameterized multifunctor; INI/OINI are the endpoint-extracting inverse functors.

### OPSCR

Return outgoing object links selected by relation, regardless of target class.

Parameters: `relation`.

### ONSCR

Return incoming object links selected by relation, regardless of source class.

Parameters: `relation`.

The slide prose calls the incoming counterpart inverse. For HTTP catalog classification it remains a parameterized multifunctor; INI/OINI are the endpoint-extracting inverse functors.

### OPSCC

Return outgoing object links whose target objects belong to targetClass, regardless of relation.

Parameters: `targetClass`.

### ONSCC

Return incoming object links whose source objects belong to sourceClass, regardless of relation.

Parameters: `sourceClass`.

The slide prose calls the incoming counterpart inverse. For HTTP catalog classification it remains a parameterized multifunctor; INI/OINI are the endpoint-extracting inverse functors.

### OPSCRC

Return outgoing object links selected by relation and targetClass.

Parameters: `relation`, `targetClass`.

### ONSCRC

Return incoming object links selected by relation and sourceClass.

Parameters: `relation`, `sourceClass`.

The slide prose calls the incoming counterpart inverse. For HTTP catalog classification it remains a parameterized multifunctor; INI/OINI are the endpoint-extracting inverse functors.

### OATTN

Return the object attributes corresponding to one classAttribute for only the prefix objects.

Parameters: `classAttribute`.

## Values and aggregates (3)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `VAL` | objectAttribute | values | value | CH10.2 / 16, 45 |
| `SIGMA` | values | scalar | aggregate | CH10.2 / 45 |
| `CARD` | * | scalar | aggregate | CH10.2 / 49, 50 |

### VAL

Extract values from object-attribute references, retaining source identity and missing-value state.

Parameters: `missingPolicy`.

The HTTP missingPolicy parameter and typed JSON encodings are API design choices, not new claims about Bouillé's syntax.

### SIGMA

Sum a complete list of homogeneous numeric scalar values, counting each source attribute once, not each distinct number.

Parameters: `missingPolicy`, `emptyType`.

HTTP arithmetic and empty-list rules are specified in SEMANTICS.md. General domain-specific numeric extensions require a declared server capability.

### CARD

Count the elements of a complete homogeneous TAD/concept selection or value list.

CARD is used in examples. Its HTTP serialization and acceptance of value lists are design extensions.

## Hypercomponent functors (14)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `HATT` | hyperclass | hyperattribute | direct | CH10.4 / 8, 12 |
| `HPSC` | hyperclass | hyperlink | direct | CH10.4 / 8, 12 |
| `HNSC` | hyperclass | hyperlink | direct | CH10.4 / 8, 12 |
| `HATTOF` | hyperattribute | hyperclass | inverse | CH10.4 / 8, 12 |
| `HINI` | hyperlink | hyperclass | inverse | CH10.4 / 8, 12 |
| `HFIN` | hyperlink | hyperclass | inverse | CH10.4 / 8, 12 |
| `HACOMP` | hyperattribute | hyperattribute | homogeneous | CH10.4 / 9 |
| `HACOMPOF` | hyperattribute | hyperattribute | homogeneous | CH10.4 / 9 |
| `HCONT` | hyperclass | hyperclass | homogeneous | CH10.4 / 9 |
| `HCONTOF` | hyperclass | hyperclass | homogeneous | CH10.4 / 9 |
| `HINTERS` | hyperclass | hyperclass | homogeneous | CH10.4 / 9 |
| `HMLCOMP` | hyperlink | hyperlink | homogeneous | CH10.4 / 9 |
| `HMLCOMPOF` | hyperlink | hyperlink | homogeneous | CH10.4 / 9 |
| `HINV` | hyperlink | hyperlink | homogeneous | CH10.4 / 12 |

### HATT

Return hyperattributes of the input hyperclasses.

### HPSC

Return outgoing hyperlinks of the input hyperclasses.

### HNSC

Return incoming hyperlinks of the input hyperclasses.

### HATTOF

Return hyperclasses owning the input hyperattributes.

### HINI

Return source hyperclasses of the oriented hyperlinks.

### HFIN

Return target hyperclasses of the oriented hyperlinks.

### HACOMP

Return immediate components of grouped hyperattributes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### HACOMPOF

Return grouped hyperattributes containing the input hyperattributes.

### HCONT

Return directly contained hyperclasses, not classes.

Optional HTTP closure: supported.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### HCONTOF

Return hyperclasses directly containing the input hyperclasses.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### HINTERS

Return other hyperclasses having a nonempty semantic intersection with the prefix hyperclasses.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### HMLCOMP

Return component hyperlinks of hypermultilinks.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### HMLCOMPOF

Return hypermultilinks containing the input hyperlinks.

### HINV

Return inverse orientations of the input hyperlinks.

## Hypercomponent bridges (8)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `IATT` | hyperattribute | classAttribute | direct | CH10.4 / 11, 12 |
| `ILINK` | hyperlink | classLink | direct | CH10.4 / 11, 12 |
| `CONT` | hyperclass | class | direct | CH10.4 / 11, 12 |
| `CONTN` | hyperclass | class | direct | CH10.4 / 11, 12 |
| `INTERS` | hyperclass | class | direct | CH10.4 / 11, 12 |
| `IATTOF` | classAttribute | hyperattribute | inverse | CH10.4 / 11, 12 |
| `ILINKOF` | classLink | hyperlink | inverse | CH10.4 / 11, 12 |
| `CONTOF` | class | hyperclass | inverse | CH10.4 / 11, 12 |

### IATT

Return class attributes corresponding to input hyperattributes.

### ILINK

Return class links corresponding to input hyperlinks.

### CONT

Return only classes directly contained in the input hyperclasses.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### CONTN

Return classes contained at any nesting depth in the input hyperclasses.

Full transitive containment is required; depth or resource limits must produce an error, never a success with truncated descendants.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### INTERS

Return member classes lying in an intersection of a prefix hyperclass with other hyperclasses.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### IATTOF

Return hyperattributes corresponding to the input class attributes.

### ILINKOF

Return hyperlinks corresponding to the input class links.

### CONTOF

Return hyperclasses directly containing the input classes.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

## Embryon functors (33)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `EATT` | classEmbryon | attributeEmbryon | direct | CH10.4 / 13 |
| `EPSC` | classEmbryon | linkEmbryon | direct | CH10.4 / 13 |
| `ENSC` | classEmbryon | linkEmbryon | direct | CH10.4 / 13 |
| `EATTOF` | attributeEmbryon | classEmbryon | inverse | CH10.4 / 13 |
| `EINI` | linkEmbryon | classEmbryon | inverse | CH10.4 / 13 |
| `EFIN` | linkEmbryon | classEmbryon | inverse | CH10.4 / 13 |
| `EINV` | linkEmbryon | linkEmbryon | homogeneous | CH10.4 / 13 |
| `EMLCOMP` | linkEmbryon | linkEmbryon | homogeneous | CH10.4 / 13 |
| `EMLCOMPOF` | linkEmbryon | linkEmbryon | homogeneous | CH10.4 / 13 |
| `EACOMP` | attributeEmbryon | attributeEmbryon | homogeneous | CH10.4 / 13 |
| `EACOMPOF` | attributeEmbryon | attributeEmbryon | homogeneous | CH10.4 / 13 |
| `EHATT` | hyperclassEmbryon | hyperattributeEmbryon | direct | CH10.4 / 13 |
| `EHPSC` | hyperclassEmbryon | hyperlinkEmbryon | direct | CH10.4 / 13 |
| `EHNSC` | hyperclassEmbryon | hyperlinkEmbryon | direct | CH10.4 / 13 |
| `EHATTOF` | hyperattributeEmbryon | hyperclassEmbryon | inverse | CH10.4 / 13 |
| `EHINI` | hyperlinkEmbryon | hyperclassEmbryon | inverse | CH10.4 / 13 |
| `EHFIN` | hyperlinkEmbryon | hyperclassEmbryon | inverse | CH10.4 / 13 |
| `EHACOMP` | hyperattributeEmbryon | hyperattributeEmbryon | homogeneous | CH10.4 / 13 |
| `EHACOMPOF` | hyperattributeEmbryon | hyperattributeEmbryon | homogeneous | CH10.4 / 13 |
| `EHCONT` | hyperclassEmbryon | hyperclassEmbryon | homogeneous | CH10.4 / 13 |
| `EHCONTOF` | hyperclassEmbryon | hyperclassEmbryon | homogeneous | CH10.4 / 13 |
| `EHINTERS` | hyperclassEmbryon | hyperclassEmbryon | homogeneous | CH10.4 / 13 |
| `EHMLCOMP` | hyperlinkEmbryon | hyperlinkEmbryon | homogeneous | CH10.4 / 13 |
| `EHMLCOMPOF` | hyperlinkEmbryon | hyperlinkEmbryon | homogeneous | CH10.4 / 13 |
| `EHINV` | hyperlinkEmbryon | hyperlinkEmbryon | homogeneous | CH10.4 / 13 |
| `EIATT` | hyperattributeEmbryon | attributeEmbryon | direct | CH10.4 / 13 |
| `EILINK` | hyperlinkEmbryon | linkEmbryon | direct | CH10.4 / 13 |
| `ECONT` | hyperclassEmbryon | classEmbryon | direct | CH10.4 / 13 |
| `ECONTN` | hyperclassEmbryon | classEmbryon | direct | CH10.4 / 13 |
| `EINTERS` | hyperclassEmbryon | classEmbryon | direct | CH10.4 / 13 |
| `EIATTOF` | attributeEmbryon | hyperattributeEmbryon | inverse | CH10.4 / 13 |
| `EILINKOF` | linkEmbryon | hyperlinkEmbryon | inverse | CH10.4 / 13 |
| `ECONTOF` | classEmbryon | hyperclassEmbryon | inverse | CH10.4 / 13 |

### EATT

Embryon counterpart of ATT: Return all class-attribute TADs belonging to the input classes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EPSC

Embryon counterpart of PSC: Return outgoing class links, not their target classes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### ENSC

Embryon counterpart of NSC: Return incoming class links, not their source classes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EATTOF

Embryon counterpart of ATTOF: Return the classes owning the input class attributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EINI

Embryon counterpart of INI: Return source classes of the oriented input class links.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EFIN

Embryon counterpart of FIN: Return target classes of the oriented input class links.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EINV

Embryon counterpart of INV: Return inverse orientations of the input class links.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EMLCOMP

Embryon counterpart of MLCOMP: Return class links composing the input multilinks.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### EMLCOMPOF

Embryon counterpart of MLCOMPOF: Return multilinks containing the input class links, when any.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EACOMP

Embryon counterpart of ACOMP: Return immediate component class attributes of grouped attributes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### EACOMPOF

Embryon counterpart of ACOMPOF: Return parent grouped class attributes containing the input attributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHATT

Embryon counterpart of HATT: Return hyperattributes of the input hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHPSC

Embryon counterpart of HPSC: Return outgoing hyperlinks of the input hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHNSC

Embryon counterpart of HNSC: Return incoming hyperlinks of the input hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHATTOF

Embryon counterpart of HATTOF: Return hyperclasses owning the input hyperattributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHINI

Embryon counterpart of HINI: Return source hyperclasses of the oriented hyperlinks.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHFIN

Embryon counterpart of HFIN: Return target hyperclasses of the oriented hyperlinks.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHACOMP

Embryon counterpart of HACOMP: Return immediate components of grouped hyperattributes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### EHACOMPOF

Embryon counterpart of HACOMPOF: Return grouped hyperattributes containing the input hyperattributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHCONT

Embryon counterpart of HCONT: Return directly contained hyperclasses, not classes.

Optional HTTP closure: supported.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### EHCONTOF

Embryon counterpart of HCONTOF: Return hyperclasses directly containing the input hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### EHINTERS

Embryon counterpart of HINTERS: Return other hyperclasses having a nonempty semantic intersection with the prefix hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### EHMLCOMP

Embryon counterpart of HMLCOMP: Return component hyperlinks of hypermultilinks.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### EHMLCOMPOF

Embryon counterpart of HMLCOMPOF: Return hypermultilinks containing the input hyperlinks.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EHINV

Embryon counterpart of HINV: Return inverse orientations of the input hyperlinks.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EIATT

Embryon counterpart of IATT: Return class attributes corresponding to input hyperattributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EILINK

Embryon counterpart of ILINK: Return class links corresponding to input hyperlinks.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### ECONT

Embryon counterpart of CONT: Return only classes directly contained in the input hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### ECONTN

Embryon counterpart of CONTN: Return classes contained at any nesting depth in the input hyperclasses.

Full transitive containment is required; depth or resource limits must produce an error, never a success with truncated descendants.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### EINTERS

Embryon counterpart of INTERS: Return member classes lying in an intersection of a prefix hyperclass with other hyperclasses.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

### EIATTOF

Embryon counterpart of IATTOF: Return hyperattributes corresponding to the input class attributes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### EILINKOF

Embryon counterpart of ILINKOF: Return hyperlinks corresponding to the input class links.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

### ECONTOF

Embryon counterpart of CONTOF: Return hyperclasses directly containing the input classes.

Chapter 10.4 states that the embryon functors mirror the preceding functors; the page 13 diagram supplies this token and its endpoints.

Containment/intersection is semantic membership, never rectangle overlap or screen geometry. Class membership is kept separate from nested hyperclass membership. CH10.4 page 11 has imprecise wording about nested classes; this HTTP profile follows the hyperclass nesting diagrams and explicitly records that choice.

## Embryon provenance (12)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `EAG` | attributeEmbryon | classAttribute | direct | CH10.4 / 14, 15 |
| `EAGOF` | classAttribute | attributeEmbryon | inverse | CH10.4 / 14, 15 |
| `ECG` | classEmbryon | class | direct | CH10.4 / 14, 15 |
| `ECGOF` | class | classEmbryon | inverse | CH10.4 / 14, 15 |
| `ELG` | linkEmbryon | classLink | direct | CH10.4 / 14, 15 |
| `ELGOF` | classLink | linkEmbryon | inverse | CH10.4 / 14, 15 |
| `EHAG` | hyperattributeEmbryon | hyperattribute | direct | CH10.4 / 14, 15 |
| `EHAGOF` | hyperattribute | hyperattributeEmbryon | inverse | CH10.4 / 14, 15 |
| `EHCG` | hyperclassEmbryon | hyperclass | direct | CH10.4 / 14, 15 |
| `EHCGOF` | hyperclass | hyperclassEmbryon | inverse | CH10.4 / 14, 15 |
| `EHLG` | hyperlinkEmbryon | hyperlink | direct | CH10.4 / 14, 15 |
| `EHLGOF` | hyperlink | hyperlinkEmbryon | inverse | CH10.4 / 14, 15 |

### EAG

Return already constructed class attribute TADs originating from the prefix embryons; never construct or mutate them.

### EAGOF

Return the recorded source embryons of the input class attribute TADs, when any.

### ECG

Return already constructed class TADs originating from the prefix embryons; never construct or mutate them.

### ECGOF

Return the recorded source embryons of the input class TADs, when any.

### ELG

Return already constructed class link TADs originating from the prefix embryons; never construct or mutate them.

### ELGOF

Return the recorded source embryons of the input class link TADs, when any.

### EHAG

Return already constructed hyperattribute TADs originating from the prefix embryons; never construct or mutate them.

### EHAGOF

Return the recorded source embryons of the input hyperattribute TADs, when any.

### EHCG

Return already constructed hyperclass TADs originating from the prefix embryons; never construct or mutate them.

### EHCGOF

Return the recorded source embryons of the input hyperclass TADs, when any.

### EHLG

Return already constructed hyperlink TADs originating from the prefix embryons; never construct or mutate them.

### EHLGOF

Return the recorded source embryons of the input hyperlink TADs, when any.

## Prototype functors (6)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `PCOMP` | prototype | prototype | homogeneous | CH10.4 / 16 |
| `PCOMPOF` | prototype | prototype | homogeneous | CH10.4 / 16 |
| `PCOMPEC` | prototype | classEmbryon | direct | CH10.4 / 16 |
| `PCOMPECOF` | classEmbryon | prototype | inverse | CH10.4 / 16 |
| `PCOMPEHC` | prototype | hyperclassEmbryon | direct | CH10.4 / 16 |
| `PCOMPEHCOF` | hyperclassEmbryon | prototype | inverse | CH10.4 / 16 |

### PCOMP

Return immediate prototypes composing the prefix prototypes.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### PCOMPOF

Return prototypes containing the prefix prototypes.

### PCOMPEC

Return class embryons composing the prefix prototypes.

The page 16 paragraph abbreviates its objects as classes/hyperclasses, but the section heading and arrows identify EC/EHC. This API explicitly uses embryon types.

### PCOMPECOF

Return prototypes containing the prefix class embryons.

The page 16 paragraph abbreviates its objects as classes/hyperclasses, but the section heading and arrows identify EC/EHC. This API explicitly uses embryon types.

### PCOMPEHC

Return hyperclass embryons composing the prefix prototypes.

The page 16 paragraph abbreviates its objects as classes/hyperclasses, but the section heading and arrows identify EC/EHC. This API explicitly uses embryon types.

### PCOMPEHCOF

Return prototypes containing the prefix hyperclass embryons.

The page 16 paragraph abbreviates its objects as classes/hyperclasses, but the section heading and arrows identify EC/EHC. This API explicitly uses embryon types.

## Structure functors (8)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `STRUCT` | prototype | structure | direct | CH10.4 / 17 |
| `PROTO` | structure | prototype | inverse | CH10.4 / 17 |
| `SCOMPC` | structure | class | direct | CH10.4 / 17 |
| `SCOMPCOF` | class | structure | inverse | CH10.4 / 17 |
| `SCOMPHC` | structure | hyperclass | direct | CH10.4 / 17 |
| `SCOMPHCOF` | hyperclass | structure | inverse | CH10.4 / 17 |
| `SCOMP` | structure | structure | homogeneous | CH10.4 / 17 |
| `SCOMPOF` | structure | structure | homogeneous | CH10.4 / 17 |

### STRUCT

Return existing structures originating from the prefix prototypes.

### PROTO

Return source prototypes of the prefix structures, when any.

### SCOMPC

Return classes composing the prefix structures.

### SCOMPCOF

Return structures containing the prefix classes.

### SCOMPHC

Return hyperclasses composing the prefix structures.

### SCOMPHCOF

Return structures containing the prefix hyperclasses.

### SCOMP

Return immediate component structures.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### SCOMPOF

Return structures containing the prefix structures.

## O-structure functors (8)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `OSTRUCT` | structure | oStructure | direct | CH10.4 / 18 |
| `OSTRUCTOF` | oStructure | structure | inverse | CH10.4 / 18 |
| `OSCOMP` | oStructure | oStructure | homogeneous | CH10.4 / 18 |
| `OSCOMPOF` | oStructure | oStructure | homogeneous | CH10.4 / 18 |
| `OSKER` | oStructure | object | direct | CH10.4 / 18 |
| `OSKEROF` | object | oStructure | inverse | CH10.4 / 18 |
| `OSCOMPOBJ` | oStructure | object | direct | CH10.4 / 18 |
| `OSCOMPOBJOF` | object | oStructure | inverse | CH10.4 / 18 |

### OSTRUCT

Return existing O-structures originating from the prefix structures.

### OSTRUCTOF

Return source structures of the prefix O-structures.

### OSCOMP

Return immediate component O-structures.

Optional HTTP closure: supported.

Every nonempty input is a grouped/composite TAD of the corresponding kind. In closure, noncomposite leaves are valid terminal results.

traversal.mode=closure is an HTTP extension. Direct means one step. Closure returns all positive-depth reachable components, excludes prefix seeds, and uses the completeness/cycle rules in SEMANTICS.md.

### OSCOMPOF

Return O-structures containing the prefix O-structures.

### OSKER

Return the kernel object of each prefix O-structure.

Each O-structure has exactly one resolvable kernel object; inconsistent source data yields MODEL_INVARIANT_VIOLATION, not a fabricated result.

### OSKEROF

Return O-structures for which the prefix objects are kernels.

### OSCOMPOBJ

Return non-kernel component objects of the prefix O-structures.

Each O-structure has exactly one resolvable kernel object; inconsistent source data yields MODEL_INVARIANT_VIOLATION, not a fabricated result.

### OSCOMPOBJOF

Return O-structures containing the prefix objects as non-kernel components.

## General functors (12)
| Functor | Prefix element type | Returned element type | Category | Source pages |
|---|---|---|---|---|
| `LREL` | relation | classLink | general | CH10.4 / 19, 22 |
| `HLREL` | relation | hyperlink | general | CH10.4 / 19, 22 |
| `ELREL` | relation | linkEmbryon | general | CH10.4 / 19, 22 |
| `EHLREL` | relation | hyperlinkEmbryon | general | CH10.4 / 19, 22 |
| `APROP` | property | classAttribute | general | CH10.4 / 20, 22 |
| `HAPROP` | property | hyperattribute | general | CH10.4 / 20, 22 |
| `EAPROP` | property | attributeEmbryon | general | CH10.4 / 20, 22 |
| `EHAPROP` | property | hyperattributeEmbryon | general | CH10.4 / 20, 22 |
| `CENS` | set | class | general | CH10.4 / 21, 22 |
| `HCENS` | set | hyperclass | general | CH10.4 / 21, 22 |
| `ECENS` | set | classEmbryon | general | CH10.4 / 21, 22 |
| `EHCENS` | set | hyperclassEmbryon | general | CH10.4 / 21, 22 |

### LREL

Return class link TADs associated with the prefix relation concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 19 shows CREL. This explicit API normalization is not a claim that the source declares them aliases.

### HLREL

Return hyperlink TADs associated with the prefix relation concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 19 shows HREL. This explicit API normalization is not a claim that the source declares them aliases.

### ELREL

Return link embryon TADs associated with the prefix relation concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 19 shows EREL. This explicit API normalization is not a claim that the source declares them aliases.

### EHLREL

Return hyperlink embryon TADs associated with the prefix relation concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 19 shows EHREL. This explicit API normalization is not a claim that the source declares them aliases.

### APROP

Return class attribute TADs associated with the prefix property concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 20 shows CPROP. This explicit API normalization is not a claim that the source declares them aliases.

### HAPROP

Return hyperattribute TADs associated with the prefix property concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 20 shows HCPROP. This explicit API normalization is not a claim that the source declares them aliases.

### EAPROP

Return attribute embryon TADs associated with the prefix property concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 20 shows EPROP. This explicit API normalization is not a claim that the source declares them aliases.

### EHAPROP

Return hyperattribute embryon TADs associated with the prefix property concept. No inverse is defined in the supplied chapter.

Canonical HTTP token follows the page 22 recap; page 20 shows EHPROP. This explicit API normalization is not a claim that the source declares them aliases.

### CENS

Return class TADs associated with the prefix set concept. No inverse is defined in the supplied chapter.

### HCENS

Return hyperclass TADs associated with the prefix set concept. No inverse is defined in the supplied chapter.

### ECENS

Return class embryon TADs associated with the prefix set concept. No inverse is defined in the supplied chapter.

### EHCENS

Return hyperclass embryon TADs associated with the prefix set concept. No inverse is defined in the supplied chapter.
