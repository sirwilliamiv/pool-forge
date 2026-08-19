// SITE_PHOTO prompt. Existing conditions.
//
// A backyard photograph is worth a lot to an estimator and almost nothing to a
// geometry engine. It gets access placement, slope, existing structures, and
// obstacles. Its geometric confidence is low by construction: v1 does no
// perspective rectification, so nothing measured off this image is trusted.

export const SITE_PHOTO_EXTRACTOR_VERSION = 'sitePhoto@1.0.0'

export const SITE_PHOTO_PROMPT = `You are looking at a photograph of a real backyard taken by a homeowner or a builder, for a swimming pool estimating tool. Report the existing conditions a estimator would walk the site to find. Do not measure anything.

Return exactly one JSON object and nothing else. No prose, no markdown fences.

ABSOLUTE RULE. This photograph is taken at an unknown angle with an unknown lens. Never report a dimension, a length, a width, a depth, an area, a footprint, a polygon, or a scale. There is no field below that accepts a measurement. Size words in "notes" are allowed only as plain description, for example "the yard looks shallow front to back", never as a number.

FIELDS. All required.

"existingPool": {"present": boolean, "condition": one of "new", "good", "dated", "damaged", "unknown"}. "present" is true only when a real pool is visible in the yard.

"visibleFeatures": array, possibly empty. Existing built things in the yard.
  "label": string. Prefer one of: "existing pool", "existing spa", "concrete slab", "paver patio", "wood deck", "screen enclosure", "lanai", "pergola", "shed", "playset", "trampoline", "outdoor kitchen", "fire pit", "retaining wall", "raised planter", "irrigation", "septic tank", "well", "AC unit", "pool equipment", "electrical panel", "gas meter", "downspout", "mature tree", "hedge row", "garden bed".
  "count": integer of 1 or more.

"houseWall": {"visible": boolean, "material": string or null, "hasSlidingDoor": boolean, "notes": string or null}. The wall of the house facing the yard, since it determines the pool's relationship to the home.

"fence": {"present": boolean, "material": one of "wood", "vinyl", "aluminum", "chain link", "masonry", "none", "unknown", "gateVisible": boolean, "notes": string or null}. Gate width and access matter: excavation equipment has to get in.

"slope": {"observed": one of "flat", "gentle", "moderate", "steep", "unknown", "direction": string or null}. "direction" is plain language, for example "falls away from the house toward the back fence".

"groundCover": one of "grass", "bare soil", "mulch", "gravel", "concrete", "paver", "mixed", "unknown".

"access": {"rating": one of "easy", "tight", "blocked", "unknown", "notes": string or null}. Whether machinery could reach the dig area, and what is in the way.

"obstacles": array of short strings, possibly empty. Overhead power lines, a large tree with roots in the dig area, a visible utility box, a neighbour's structure hard on the line.

"notes": array of short strings, possibly empty. Anything else worth a site visit note.

"confidence": {"features": number, "houseWall": number, "fence": number, "slope": number, "access": number}. Each 0 to 1. Slope judged from a single photo is rarely above 0.5; be honest.

EXAMPLES OF CORRECT OUTPUT.

Example 1, a flat grassy yard, wood fence with a gate on the left, sliding glass door on a stucco wall, AC unit on the right:
{"existingPool":{"present":false,"condition":"unknown"},"visibleFeatures":[{"label":"concrete slab","count":1},{"label":"AC unit","count":1},{"label":"mature tree","count":2}],"houseWall":{"visible":true,"material":"stucco","hasSlidingDoor":true,"notes":"covered patio runs the width of the wall"},"fence":{"present":true,"material":"wood","gateVisible":true,"notes":"gate on the left side of the yard, looks single width"},"slope":{"observed":"flat","direction":null},"groundCover":"grass","access":{"rating":"tight","notes":"the only gate is a single width gate between the house and the fence"},"obstacles":["overhead service drop crosses the left side of the yard"],"notes":["irrigation heads visible in the lawn"],"confidence":{"features":0.85,"houseWall":0.9,"fence":0.88,"slope":0.45,"access":0.6}}

Example 2, an existing dated pool inside a screen cage, cracked deck:
{"existingPool":{"present":true,"condition":"dated"},"visibleFeatures":[{"label":"existing pool","count":1},{"label":"screen enclosure","count":1},{"label":"pool equipment","count":1},{"label":"concrete slab","count":1}],"houseWall":{"visible":true,"material":"painted block","hasSlidingDoor":true,"notes":null},"fence":{"present":false,"material":"none","gateVisible":false,"notes":"screen cage takes the place of a fence on three sides"},"slope":{"observed":"flat","direction":null},"groundCover":"concrete","access":{"rating":"blocked","notes":"the screen cage encloses the pool completely, panels would have to come out"},"obstacles":["cracked deck around the shallow end","screen cage footers sit on the deck"],"notes":["waterline tile is missing in several places","interior finish looks like old marcite"],"confidence":{"features":0.9,"houseWall":0.8,"fence":0.7,"slope":0.4,"access":0.75}}

Example 3, a sloped yard falling away from the house, retaining wall at the back, taken at a steep angle:
{"existingPool":{"present":false,"condition":"unknown"},"visibleFeatures":[{"label":"retaining wall","count":1},{"label":"wood deck","count":1},{"label":"shed","count":1}],"houseWall":{"visible":true,"material":"brick","hasSlidingDoor":false,"notes":"raised deck with stairs down to the yard"},"fence":{"present":true,"material":"chain link","gateVisible":false,"notes":null},"slope":{"observed":"moderate","direction":"falls away from the house toward the back fence"},"groundCover":"mixed","access":{"rating":"tight","notes":"the slope and the raised deck limit approach from the house side"},"obstacles":["retaining wall at the low end of the yard","large tree canopy over the middle of the yard"],"notes":["photo is taken from the deck looking down, the far corners are not visible"],"confidence":{"features":0.75,"houseWall":0.8,"fence":0.6,"slope":0.5,"access":0.5}}

Example 4, a dusk photo, mostly dark, only a fence line and grass visible:
{"existingPool":{"present":false,"condition":"unknown"},"visibleFeatures":[],"houseWall":{"visible":false,"material":null,"hasSlidingDoor":false,"notes":null},"fence":{"present":true,"material":"unknown","gateVisible":false,"notes":"fence line visible as a silhouette"},"slope":{"observed":"unknown","direction":null},"groundCover":"grass","access":{"rating":"unknown","notes":null},"obstacles":[],"notes":["photo is too dark to assess the yard, ask the customer for a daytime photo"],"confidence":{"features":0.2,"houseWall":0.1,"fence":0.4,"slope":0.1,"access":0.1}}`
