# Recorded vision responses

Hand-authored model responses used by every default test run. Billing is not
linked on the target GCP project, so nothing here was captured live; each file
is written to look exactly like what the model returns, including the ways it
goes wrong. When live capture becomes possible these files are replaced with
real recordings and the tests do not change.

Files are `.txt`, not `.json`, on purpose: several of them are deliberately
malformed and would not survive a JSON linter or an editor's formatter.

| File | What it exercises |
|---|---|
| `classify-sketch.txt` | A clean CLASSIFY response |
| `classify-screenshot-scaled.txt` | A screenshot that has a scale reference |
| `classify-screenshot-unscaled.txt` | A screenshot flagged `no-scale-reference` |
| `sketch-good.txt` | The happy path: polygon, dimensions, legend, features |
| `sketch-unparseable-dimension.txt` | A dimension whose text does not parse |
| `sketch-fenced.txt` | Valid JSON wrapped in ```json fences |
| `sketch-invalid-zod.txt` | Valid JSON, invalid against the schema |
| `sketch-truncated.txt` | Output cut off mid-object |
| `empty-object.txt` | The `{}` a schema-constrained model emits when it gives up |
| `concept-render-good.txt` | Intent only, as it should be |
| `concept-render-with-dimensions.txt` | A render that hallucinated dimensions and a footprint |
| `site-plan-good.txt` | Boundary, house, setbacks, scale bar, north arrow |
| `site-plan-no-scale.txt` | A plan with a ratio scale and no bar |
| `site-photo-good.txt` | Existing conditions |
