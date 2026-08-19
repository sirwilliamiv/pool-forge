// CONCEPT_RENDER prompt. Intent only.
//
// A generated render has no ground truth scale. Anything numeric on it, drawn
// or implied, is decoration produced by an image model, and treating it as a
// measurement is the single most dangerous failure mode in this feature: a
// wrong number here becomes a signed contract. So the response schema for this
// extractor has no dimension fields at all, the prompt refuses them explicitly,
// and the extractor strips them again on the way out.

export const CONCEPT_RENDER_EXTRACTOR_VERSION = 'conceptRender@1.0.0'

export const CONCEPT_RENDER_PROMPT = `You are reading an inspiration image of a finished swimming pool: an AI render, a magazine photo, or a saved design idea. Your job is to describe what the customer wants, not how big it is.

Return exactly one JSON object and nothing else. No prose, no markdown fences.

ABSOLUTE RULE, READ IT TWICE. This image contains no measurable information. Never report a dimension, a length, a width, a depth, an area, a footprint, a polygon, a coordinate, or a scale. If numbers are printed on the image, ignore them: generated renders routinely draw plausible looking numbers that are pure fiction. There is no field below that accepts a measurement, and adding one will get your whole response discarded.

FIELDS. All required.

"shapeFamily": exactly one of "rectangle", "oval", "kidney", "grecian", "roman", "lagoon", "lshape", "freeform", "unknown".
  rectangle  Straight sides and right angles, a modern geometric pool.
  oval       One long axis, one short axis, no straight runs.
  grecian    A rectangle with the four corners cut off at 45 degrees.
  roman      A rectangle with a semicircular bow on one or both ends.
  kidney     Curved with one concave bite along a long side.
  lagoon     Several convex lobes, a natural pond look, usually with rock.
  lshape     Two rectangles joined at a right angle.
  freeform   Curved and irregular, none of the above.
  unknown    You cannot tell from this view.

"features": array, possibly empty. What is visibly built into the design.
  "label": string. Prefer one of: "spa", "tanning ledge", "sun shelf", "baja shelf", "bench", "swim-up bar", "steps", "roman steps", "entry steps", "beach entry", "waterfall", "sheer descent", "bubbler", "deck jet", "grotto", "slide", "diving board", "raised bond beam", "fire bowl", "planter", "infinity edge", "perimeter overflow", "vanishing edge", "handrail", "ladder", "outdoor kitchen", "pergola", "fire pit", "landscape lighting". If you see something outside this list, describe it in two or three words.
  "count": integer of 1 or more. Count what you can see. Use 1 when you cannot count them.

"materials": {"interiorFinish": string or null, "copingMaterial": string or null, "tileBand": string or null, "deckMaterial": string or null}. Describe the visible finish in a few words, for example "dark pebble", "white plaster", "travertine", "glass mosaic, blue", "wood look porcelain". Null where the view does not show it.

"deckMaterialFamily": one of "concrete", "paver", "travertine", "grass", "unknown". The closest match to the visible decking.

"enclosure": {"present": boolean, "kind": one of "screen", "lanai", "none"}. A screen enclosure is a black framed cage over the whole pool. A lanai is a solid roofed area attached to the house.

"styleNotes": array of short strings, possibly empty. The design language a builder would need to reproduce the feel: "modern minimalist, dark water", "tropical, heavy planting, rockwork", "resort style, symmetrical, two fire bowls", "night scene, warm underwater lighting".

"waterColor": string or null, for example "dark navy", "caribbean blue", "black", "turquoise".

"confidence": {"shapeFamily": number, "features": number, "materials": number, "style": number}. Each 0 to 1, scoring how clearly THIS image shows that aspect. An oblique night shot that hides half the pool scores the shape low.

EXAMPLES OF CORRECT OUTPUT.

Example 1, a modern rectangular pool with a vanishing edge over a valley, dark water, large format porcelain deck:
{"shapeFamily":"rectangle","features":[{"label":"vanishing edge","count":1},{"label":"tanning ledge","count":1},{"label":"spa","count":1},{"label":"sheer descent","count":3}],"materials":{"interiorFinish":"dark grey pebble","copingMaterial":"grey porcelain, square edge","tileBand":"glass mosaic, charcoal","deckMaterial":"large format porcelain"},"deckMaterialFamily":"paver","enclosure":{"present":false,"kind":"none"},"styleNotes":["modern minimalist","dark water, mirror finish","strong horizontal lines, no curves"],"waterColor":"dark navy","confidence":{"shapeFamily":0.95,"features":0.88,"materials":0.7,"style":0.9}}

Example 2, a tropical lagoon pool with rock waterfall and grotto, heavy planting, twilight lighting:
{"shapeFamily":"lagoon","features":[{"label":"waterfall","count":2},{"label":"grotto","count":1},{"label":"beach entry","count":1},{"label":"slide","count":1},{"label":"landscape lighting","count":1}],"materials":{"interiorFinish":"blue pebble","copingMaterial":"natural stone, irregular","tileBand":null,"deckMaterial":"stamped concrete"},"deckMaterialFamily":"concrete","enclosure":{"present":false,"kind":"none"},"styleNotes":["tropical resort","heavy rockwork and planting","twilight scene with warm lighting"],"waterColor":"caribbean blue","confidence":{"shapeFamily":0.86,"features":0.8,"materials":0.6,"style":0.92}}

Example 3, a screened Florida pool with a lanai, printed text on the image reading "30 x 15":
{"shapeFamily":"rectangle","features":[{"label":"spa","count":1},{"label":"sun shelf","count":1},{"label":"bubbler","count":2}],"materials":{"interiorFinish":"white plaster","copingMaterial":"travertine","tileBand":"6x6 blue","deckMaterial":"travertine"},"deckMaterialFamily":"travertine","enclosure":{"present":true,"kind":"screen"},"styleNotes":["Florida screen cage","travertine deck, light and bright","symmetrical layout facing the lanai"],"waterColor":"turquoise","confidence":{"shapeFamily":0.9,"features":0.84,"materials":0.72,"style":0.8}}

Example 4, a tight crop of a kidney pool at night where only part of the water and one fire bowl are visible:
{"shapeFamily":"kidney","features":[{"label":"fire bowl","count":1}],"materials":{"interiorFinish":null,"copingMaterial":"brick paver","tileBand":null,"deckMaterial":null},"deckMaterialFamily":"unknown","enclosure":{"present":false,"kind":"none"},"styleNotes":["night scene","warm underwater lighting"],"waterColor":"turquoise","confidence":{"shapeFamily":0.45,"features":0.5,"materials":0.35,"style":0.6}}

Example 5, a plain white plaster rectangular pool in a suburban yard, nothing else visible:
{"shapeFamily":"rectangle","features":[{"label":"entry steps","count":1}],"materials":{"interiorFinish":"white plaster","copingMaterial":"cantilever concrete","tileBand":null,"deckMaterial":"broom finish concrete"},"deckMaterialFamily":"concrete","enclosure":{"present":false,"kind":"none"},"styleNotes":["plain, budget conscious","no water features"],"waterColor":"light blue","confidence":{"shapeFamily":0.93,"features":0.7,"materials":0.75,"style":0.8}}`
