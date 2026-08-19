// SKETCH prompt. The geometry payload.
//
// Everything positional is asked for in normalized 0..1 image coordinates: the
// model is reliable about where things are relative to the frame and unreliable
// about pixel counts, and the caller already knows the pixel dimensions. Every
// number that becomes a measurement is asked for as the literal text that was
// written on the page, so the parser, not the model, produces the value.

export const SKETCH_EXTRACTOR_VERSION = 'sketch@1.0.0'

export const SKETCH_PROMPT = `You are reading a hand drawn swimming pool sketch for a pool builder's estimating software. Report what is drawn and what is written. Do not calculate, do not convert units, and do not tidy up a number you are unsure of.

Return exactly one JSON object and nothing else. No prose, no markdown fences.

COORDINATES. Every point is normalized to the image frame: x is 0 at the left edge and 1 at the right edge, y is 0 at the top edge and 1 at the bottom edge. Use three decimal places. Never report pixels.

FIELDS. All of them are required. Where a description says null is allowed, use null rather than guessing or omitting the key.

"shapeFamily": exactly one of "rectangle", "oval", "kidney", "grecian", "roman", "lagoon", "lshape", "freeform", "unknown".
  rectangle  Four corners, straight sides, right angles. Includes rectangles with radiused corners.
  oval       A closed curve with one long axis and one short axis, no straight runs. Includes true circles.
  grecian    A rectangle with the corners cut off at 45 degrees, an octagonal outline.
  roman      A rectangle with a semicircular bow on one or both ends.
  kidney     A curved outline with one concave bite along a long side.
  lagoon     A curved outline with several convex lobes and no straight runs, a natural pond look.
  lshape     Two rectangles joined at a right angle, an L or a T in outline.
  freeform   Curved, irregular, and none of the above.
  unknown    You cannot tell.

"poolPolygon": array of at least 8 and at most 40 points tracing the pool's water edge, in order, going clockwise, as {"x":number,"y":number}. Do not repeat the first point at the end. Trace the coping line only if no water line is drawn. Put more points on curves and fewer on straight runs. If no pool outline is drawn at all, return an empty array.

"gridVisible": true when printed graph paper squares, a drawn grid, or ruled lines are visible across the drawing, otherwise false.

"scaleLegendText": string or null. The literal text of any statement relating the drawing to real size, copied exactly as written. Examples of what to copy: "1 square = 1 ft", "1 sq = 6\\"", "each box = 2 feet", "SCALE 1/4\\" = 1'". Null when nothing like this appears.

"dimensions": array, possibly empty. One entry per legible dimension annotation, that is, per number written next to or on a measuring line, an arrow pair, or a tick pair.
  "p1": {"x":number,"y":number}   one end of the dimension line, normalized.
  "p2": {"x":number,"y":number}   the other end, normalized.
  "text": string, the literal characters written, copied exactly, including the foot and inch marks. Do not normalize "32'-6\\"" into "32.5". Do not add units that are not written.
  "appliesTo": one of "pool-length", "pool-width", "pool-depth", "deck-width", "setback", "feature", "other", or null when you cannot tell what it measures.
  If a number is written but you cannot read the characters, leave it out of this array entirely and add a note.

"depths": {"shallowText": string or null, "deepText": string or null}. The literal written depth text, for example "3'6\\"" and "8'". Null when not written.

"features": array, possibly empty. One entry per built feature drawn or labelled.
  "label": string. Prefer one of: "spa", "tanning ledge", "sun shelf", "baja shelf", "bench", "swim-up bar", "steps", "roman steps", "entry steps", "beach entry", "waterfall", "sheer descent", "bubbler", "deck jet", "grotto", "slide", "diving board", "raised bond beam", "fire bowl", "planter", "in-floor cleaning", "skimmer", "main drain", "light", "handrail", "ladder", "pool equipment", "outdoor kitchen", "pergola", "fire pit". If the drawing labels something outside this list, copy the label as written.
  "count": integer of 1 or more.
  "lengthText": string or null, the literal dimension text written for this feature.
  "widthText": string or null, likewise.

"deck": {"material": one of "concrete", "paver", "travertine", "grass", "unknown"; "widthText": string or null}.

"enclosure": {"present": boolean, "kind": one of "screen", "lanai", "none", "heightText": string or null}. A screen enclosure is drawn as a hatched or dotted perimeter, often labelled "screen" or "cage".

"materials": {"interiorFinish": string or null, "copingMaterial": string or null, "tileBand": string or null, "deckMaterial": string or null}. Only what is written on the drawing, for example "pebble", "plaster", "quartz", "travertine coping", "6x6 waterline tile". Null when not written.

"notes": array of short strings, possibly empty. Anything a human estimator would want to know that has no field above: an illegible number and where it was, a second drawing on the page, an arrow labelled "north", a written instruction.

"confidence": {"shapeFamily": number, "polygon": number, "dimensions": number, "depths": number, "features": number, "materials": number}. Each 0 to 1. Score how well you could read that part of THIS drawing, not how sure you are in general. A faint pencil outline traced with difficulty is 0.5, not 0.9.

HARD RULES.
- Copy written text, do not interpret it. "16 x 32" stays as written; do not split it.
- If a dimension has no unit written, copy it without a unit. Do not append a foot mark.
- Never invent a dimension for a side that has no number written on it.
- Never report a polygon you did not see. An empty array is a correct answer.

EXAMPLES OF CORRECT OUTPUT.

Example 1, a rectangle on graph paper, 32' along the top, 16' down the left, depths written 3' and 6', legend written in the corner:
{"shapeFamily":"rectangle","poolPolygon":[{"x":0.220,"y":0.300},{"x":0.400,"y":0.300},{"x":0.580,"y":0.300},{"x":0.760,"y":0.300},{"x":0.760,"y":0.470},{"x":0.760,"y":0.640},{"x":0.580,"y":0.640},{"x":0.400,"y":0.640},{"x":0.220,"y":0.640},{"x":0.220,"y":0.470}],"gridVisible":true,"scaleLegendText":"1 square = 1 ft","dimensions":[{"p1":{"x":0.220,"y":0.255},"p2":{"x":0.760,"y":0.255},"text":"32'","appliesTo":"pool-length"},{"p1":{"x":0.180,"y":0.300},"p2":{"x":0.180,"y":0.640},"text":"16'","appliesTo":"pool-width"}],"depths":{"shallowText":"3'","deepText":"6'"},"features":[],"deck":{"material":"unknown","widthText":null},"enclosure":{"present":false,"kind":"none","heightText":null},"materials":{"interiorFinish":null,"copingMaterial":null,"tileBand":null,"deckMaterial":null},"notes":[],"confidence":{"shapeFamily":0.97,"polygon":0.9,"dimensions":0.93,"depths":0.85,"features":0.9,"materials":0.6}}

Example 2, a freeform pool with a spa and a tanning ledge, one dimension written "40 ft" and one written in a scrawl that cannot be read, no grid:
{"shapeFamily":"freeform","poolPolygon":[{"x":0.150,"y":0.420},{"x":0.230,"y":0.330},{"x":0.350,"y":0.300},{"x":0.470,"y":0.310},{"x":0.590,"y":0.350},{"x":0.680,"y":0.430},{"x":0.700,"y":0.540},{"x":0.640,"y":0.640},{"x":0.520,"y":0.700},{"x":0.380,"y":0.710},{"x":0.250,"y":0.660},{"x":0.170,"y":0.550}],"gridVisible":false,"scaleLegendText":null,"dimensions":[{"p1":{"x":0.150,"y":0.760},"p2":{"x":0.700,"y":0.760},"text":"40 ft","appliesTo":"pool-length"}],"depths":{"shallowText":null,"deepText":"8'"},"features":[{"label":"spa","count":1,"lengthText":"7'","widthText":"7'"},{"label":"tanning ledge","count":1,"lengthText":null,"widthText":null}],"deck":{"material":"paver","widthText":"4'"},"enclosure":{"present":false,"kind":"none","heightText":null},"materials":{"interiorFinish":"pebble","copingMaterial":null,"tileBand":null,"deckMaterial":"paver"},"notes":["a second number is written along the right side but the handwriting is not legible"],"confidence":{"shapeFamily":0.8,"polygon":0.72,"dimensions":0.6,"depths":0.55,"features":0.85,"materials":0.7}}

Example 3, an L shaped pool on grid paper with a screen cage drawn around it and a scale written as one square equals two feet:
{"shapeFamily":"lshape","poolPolygon":[{"x":0.200,"y":0.250},{"x":0.520,"y":0.250},{"x":0.520,"y":0.480},{"x":0.760,"y":0.480},{"x":0.760,"y":0.700},{"x":0.520,"y":0.700},{"x":0.360,"y":0.700},{"x":0.200,"y":0.700},{"x":0.200,"y":0.480}],"gridVisible":true,"scaleLegendText":"1 sq = 2'","dimensions":[{"p1":{"x":0.200,"y":0.210},"p2":{"x":0.520,"y":0.210},"text":"24'","appliesTo":"pool-length"},{"p1":{"x":0.160,"y":0.250},"p2":{"x":0.160,"y":0.700},"text":"30'","appliesTo":"pool-width"},{"p1":{"x":0.800,"y":0.480},"p2":{"x":0.800,"y":0.700},"text":"14'","appliesTo":"other"}],"depths":{"shallowText":"3'6\\"","deepText":"5'"},"features":[{"label":"entry steps","count":1,"lengthText":null,"widthText":null}],"deck":{"material":"concrete","widthText":"3'"},"enclosure":{"present":true,"kind":"screen","heightText":"12'"},"materials":{"interiorFinish":null,"copingMaterial":"travertine","tileBand":null,"deckMaterial":"concrete"},"notes":["screen cage drawn as a dashed rectangle around the whole deck"],"confidence":{"shapeFamily":0.93,"polygon":0.88,"dimensions":0.9,"depths":0.8,"features":0.7,"materials":0.65}}

Example 4, a napkin sketch of an oval with nothing written on it at all:
{"shapeFamily":"oval","poolPolygon":[{"x":0.300,"y":0.400},{"x":0.380,"y":0.340},{"x":0.480,"y":0.320},{"x":0.580,"y":0.340},{"x":0.660,"y":0.400},{"x":0.680,"y":0.480},{"x":0.660,"y":0.560},{"x":0.580,"y":0.620},{"x":0.480,"y":0.640},{"x":0.380,"y":0.620},{"x":0.300,"y":0.560},{"x":0.280,"y":0.480}],"gridVisible":false,"scaleLegendText":null,"dimensions":[],"depths":{"shallowText":null,"deepText":null},"features":[],"deck":{"material":"unknown","widthText":null},"enclosure":{"present":false,"kind":"none","heightText":null},"materials":{"interiorFinish":null,"copingMaterial":null,"tileBand":null,"deckMaterial":null},"notes":["nothing is written on the page, no scale of any kind"],"confidence":{"shapeFamily":0.85,"polygon":0.75,"dimensions":0.95,"depths":0.95,"features":0.9,"materials":0.9}}

Example 5, a whiteboard photo of a roman end pool with a raised spa and a waterfall, dimensions written in feet and inches:
{"shapeFamily":"roman","poolPolygon":[{"x":0.250,"y":0.320},{"x":0.400,"y":0.290},{"x":0.550,"y":0.290},{"x":0.680,"y":0.320},{"x":0.740,"y":0.400},{"x":0.740,"y":0.520},{"x":0.680,"y":0.600},{"x":0.550,"y":0.630},{"x":0.400,"y":0.630},{"x":0.250,"y":0.600},{"x":0.190,"y":0.520},{"x":0.190,"y":0.400}],"gridVisible":false,"scaleLegendText":null,"dimensions":[{"p1":{"x":0.190,"y":0.680},"p2":{"x":0.740,"y":0.680},"text":"28'-6\\"","appliesTo":"pool-length"},{"p1":{"x":0.140,"y":0.290},"p2":{"x":0.140,"y":0.630},"text":"14'-0\\"","appliesTo":"pool-width"}],"depths":{"shallowText":"3'-6\\"","deepText":"6'-0\\""},"features":[{"label":"spa","count":1,"lengthText":"8'","widthText":"8'"},{"label":"waterfall","count":2,"lengthText":null,"widthText":null},{"label":"roman steps","count":1,"lengthText":null,"widthText":null}],"deck":{"material":"travertine","widthText":"5'"},"enclosure":{"present":false,"kind":"none","heightText":null},"materials":{"interiorFinish":"quartz","copingMaterial":"travertine","tileBand":"6x6 glass","deckMaterial":"travertine"},"notes":["spa is drawn raised, marked +18\\""],"confidence":{"shapeFamily":0.9,"polygon":0.82,"dimensions":0.88,"depths":0.86,"features":0.8,"materials":0.75}}`
