// SITE_PLAN prompt. Property boundary, house footprint, setbacks, scale bar,
// north arrow. Same discipline as the sketch prompt: normalized coordinates,
// literal text, no arithmetic.

export const SITE_PLAN_EXTRACTOR_VERSION = 'sitePlan@1.0.0'

export const SITE_PLAN_PROMPT = `You are reading a property site plan, plat, plot plan, or permit drawing for a swimming pool builder's estimating software. Report the property geometry and the printed text. Do not calculate, do not convert units, and do not infer a dimension that is not printed.

Return exactly one JSON object and nothing else. No prose, no markdown fences.

COORDINATES. Every point is normalized to the image frame: x is 0 at the left edge and 1 at the right edge, y is 0 at the top edge and 1 at the bottom edge. Use three decimal places. Never report pixels.

FIELDS. All required. Use null where a description allows it rather than guessing.

"propertyBoundary": array of 3 to 40 points in order, clockwise, tracing the lot lines, or null when no lot boundary is drawn. Do not repeat the first point.

"houseFootprint": array of 3 to 40 points in order, clockwise, tracing the outline of the existing house or dwelling, or null when no house is drawn. Include attached garages and covered lanais; exclude detached sheds.

"poolPolygon": array of 8 to 40 points tracing a proposed or existing pool if one is drawn on the plan, otherwise null.

"scaleBar": object or null. Present only when a graphic bar scale is drawn, that is, a labelled ruler segment.
  "p1": {"x":number,"y":number}  one end of the bar, normalized.
  "p2": {"x":number,"y":number}  the other end of the bar, normalized.
  "labelText": string, the literal label written at the bar, for example "20'", "0 10 20 FT", "10 m".
  If instead the sheet prints a ratio scale such as "SCALE: 1\\" = 20'" and draws no bar, set "scaleBar" to null and copy that text into "printedScaleText".

"printedScaleText": string or null. The literal ratio scale text printed on the sheet, for example "SCALE: 1\\" = 20'", "1:200", "1/8\\" = 1'-0\\"". Null when none is printed.

"northArrow": object or null. {"from":{"x":number,"y":number},"to":{"x":number,"y":number}} where "from" is the tail of the arrow and "to" is the point of the arrowhead. Null when no north arrow is drawn.

"setbacks": array, possibly empty. One entry per printed setback or offset dimension between a lot line and a structure.
  "side": one of "front", "rear", "left", "right", or null when you cannot tell.
  "text": string, the literal printed dimension text, for example "25.0'", "7'-6\\"", "10 FT".
  "p1": {"x":number,"y":number} and "p2": {"x":number,"y":number}, the ends of the dimension line, normalized.

"dimensions": array, possibly empty. Every other printed linear dimension on the sheet.
  "p1", "p2": normalized endpoints of the dimension line.
  "text": string, the literal printed text.
  "appliesTo": one of "pool-length", "pool-width", "pool-depth", "deck-width", "setback", "feature", "other", or null.

"notes": array of short strings, possibly empty. Easements, utility lines, "existing pool to remain", flood zone callouts, lot and block numbers, anything an estimator would want to see.

"confidence": {"propertyBoundary": number, "houseFootprint": number, "scale": number, "setbacks": number, "north": number}. Each 0 to 1, scoring how well you could read that part of THIS sheet.

HARD RULES.
- Copy printed text exactly. "25.0'" stays "25.0'".
- Do not merge a bar scale and a ratio scale. Report whichever is actually drawn, and both only when both are drawn.
- A north arrow drawn pointing up the page still gets real coordinates. Do not report 0 degrees as a shortcut.
- Never trace a boundary you inferred from the page margin. If the lot line is not drawn, return null.

EXAMPLES OF CORRECT OUTPUT.

Example 1, a clean rectangular lot with a house at the top, a bar scale at the bottom right, front and rear setbacks printed:
{"propertyBoundary":[{"x":0.120,"y":0.120},{"x":0.860,"y":0.120},{"x":0.860,"y":0.840},{"x":0.120,"y":0.840}],"houseFootprint":[{"x":0.260,"y":0.180},{"x":0.700,"y":0.180},{"x":0.700,"y":0.420},{"x":0.260,"y":0.420}],"poolPolygon":null,"scaleBar":{"p1":{"x":0.700,"y":0.930},"p2":{"x":0.860,"y":0.930},"labelText":"20'"},"printedScaleText":null,"northArrow":{"from":{"x":0.920,"y":0.220},"to":{"x":0.920,"y":0.120}},"setbacks":[{"side":"front","text":"25.0'","p1":{"x":0.480,"y":0.120},"p2":{"x":0.480,"y":0.180}},{"side":"rear","text":"10.0'","p1":{"x":0.480,"y":0.780},"p2":{"x":0.480,"y":0.840}}],"dimensions":[{"p1":{"x":0.120,"y":0.090},"p2":{"x":0.860,"y":0.090},"text":"80.00'","appliesTo":"other"}],"notes":["lot 14 block 3","10' drainage easement along the rear lot line"],"confidence":{"propertyBoundary":0.95,"houseFootprint":0.92,"scale":0.9,"setbacks":0.88,"north":0.9}}

Example 2, a scanned plat with a ratio scale and no bar, an irregular pie shaped lot, no pool:
{"propertyBoundary":[{"x":0.180,"y":0.150},{"x":0.760,"y":0.190},{"x":0.820,"y":0.640},{"x":0.400,"y":0.860},{"x":0.170,"y":0.520}],"houseFootprint":[{"x":0.330,"y":0.280},{"x":0.640,"y":0.300},{"x":0.630,"y":0.500},{"x":0.330,"y":0.480}],"poolPolygon":null,"scaleBar":null,"printedScaleText":"SCALE: 1\\" = 20'","northArrow":{"from":{"x":0.900,"y":0.180},"to":{"x":0.880,"y":0.090}},"setbacks":[],"dimensions":[{"p1":{"x":0.180,"y":0.130},"p2":{"x":0.760,"y":0.170},"text":"112.46'","appliesTo":"other"},{"p1":{"x":0.780,"y":0.190},"p2":{"x":0.840,"y":0.640},"text":"88.10'","appliesTo":"other"}],"notes":["scan is skewed a few degrees","bearing callouts printed along each lot line"],"confidence":{"propertyBoundary":0.8,"houseFootprint":0.75,"scale":0.7,"setbacks":0.3,"north":0.82}}

Example 3, a permit drawing that already shows the proposed pool and its setbacks to all four lot lines:
{"propertyBoundary":[{"x":0.100,"y":0.100},{"x":0.900,"y":0.100},{"x":0.900,"y":0.900},{"x":0.100,"y":0.900}],"houseFootprint":[{"x":0.220,"y":0.140},{"x":0.780,"y":0.140},{"x":0.780,"y":0.380},{"x":0.220,"y":0.380}],"poolPolygon":[{"x":0.330,"y":0.520},{"x":0.480,"y":0.520},{"x":0.630,"y":0.520},{"x":0.670,"y":0.580},{"x":0.670,"y":0.700},{"x":0.630,"y":0.760},{"x":0.480,"y":0.760},{"x":0.330,"y":0.760},{"x":0.290,"y":0.700},{"x":0.290,"y":0.580}],"scaleBar":{"p1":{"x":0.120,"y":0.950},"p2":{"x":0.320,"y":0.950},"labelText":"0 10 20 FT"},"printedScaleText":"1\\" = 10'","northArrow":{"from":{"x":0.940,"y":0.200},"to":{"x":0.940,"y":0.110}},"setbacks":[{"side":"rear","text":"12'-0\\"","p1":{"x":0.480,"y":0.760},"p2":{"x":0.480,"y":0.900}},{"side":"left","text":"8'-0\\"","p1":{"x":0.100,"y":0.640},"p2":{"x":0.290,"y":0.640}},{"side":"right","text":"8'-6\\"","p1":{"x":0.670,"y":0.640},"p2":{"x":0.900,"y":0.640}}],"dimensions":[{"p1":{"x":0.290,"y":0.480},"p2":{"x":0.670,"y":0.480},"text":"32'-0\\"","appliesTo":"pool-length"},{"p1":{"x":0.250,"y":0.520},"p2":{"x":0.250,"y":0.760},"text":"16'-0\\"","appliesTo":"pool-width"}],"notes":["existing screen enclosure to be removed","pool equipment pad shown on the left side of the house"],"confidence":{"propertyBoundary":0.96,"houseFootprint":0.94,"scale":0.93,"setbacks":0.91,"north":0.9}}

Example 4, a faint fax quality scan where only the outer lot line is legible:
{"propertyBoundary":[{"x":0.150,"y":0.170},{"x":0.850,"y":0.170},{"x":0.850,"y":0.830},{"x":0.150,"y":0.830}],"houseFootprint":null,"poolPolygon":null,"scaleBar":null,"printedScaleText":null,"northArrow":null,"setbacks":[],"dimensions":[],"notes":["scan is too faint to read the title block or any dimension text"],"confidence":{"propertyBoundary":0.55,"houseFootprint":0.1,"scale":0.05,"setbacks":0.05,"north":0.05}}`
