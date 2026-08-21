# Scene templates and user-owned site context — plan

Two problems, one root cause: **the scene contains things the user never put there
and cannot remove.**

`SceneRoot.tsx` renders a house wall, three trees and two loungers whenever
`showSiteContext` is true, which is Design, Build and Customer mode — everything
except Plan. Their positions are constants inside the render components:

```
trees     (-26, 8) · (28, -14) · (-30, -16)
loungers  (-18, -10) · (-15, -10.5)
wall      (0, 7, -28)
```

Nothing about them comes from the project, so every backyard in the product looks
identical. It also renders a decorative `EquipmentPad` at `(24, 0, -22)` in Design
and Build, which is a real quoted line item appearing as scenery on a job that has
not got one.

The worst instance is Customer mode: the one view a homeowner sees is the one most
likely to make them ask where those trees are going.

## Part A — site context becomes the user's

Delete the hardcoded block. Add the same objects to the catalog so they are placed,
moved, and removed like everything else, and are visible in Layers.

New stencils in `DECK_HOUSE`:

| id | name | priced |
|---|---|---|
| `site.tree` | Tree | no, scenery |
| `site.lounger` | Lounger | no, scenery |
| `site.house-wall` | House wall | no, existing structure |

The renderers already exist (`Trees.tsx`, `Loungers.tsx`, `HouseWall.tsx`); they get
wired into the `SceneRoot` dispatch by stencil id instead of being drawn
unconditionally. `pricingBehavior` marks them non-quoting so scenery never reaches a
customer's total, and `exportVisibility` keeps them off the construction packet.

Consequence worth stating plainly: existing projects lose their decoration on next
open. That is the point — it was never theirs — but it is a visible change.

## Part B — scenes become templates

`ShapeTemplate` already exists but models a single shape and both its commands are
`not implemented` stubs. A scene is a different thing, so it gets its own model
rather than being forced into that one.

```
SceneTemplate
  id, orgId, name, description?
  payload      Json     the drawing: shapes, and nothing else
  objectCount  Int      shown in the picker without parsing the payload
  isDefault    Boolean  at most one per org, applied to new projects
  createdBy?, createdAt, updatedAt
  @@unique([orgId, name])
```

Commands, all real, all through the registry:

| command | does |
|---|---|
| `template.scene.save` | current drawing becomes a named template |
| `template.scene.apply` | replace or merge a template into this project |
| `template.scene.list` | org's templates, newest first |
| `template.scene.delete` | remove one |
| `template.scene.setDefault` | the scene new projects start from |

`apply` takes a `mode: 'replace' | 'merge'`. Replace is destructive, so it states the
object count it is about to discard and requires an explicit confirmation flag rather
than silently wiping a drawing.

## Sequence

1. Migration and model.
2. Three catalog stencils plus renderer wiring; delete the hardcoded block.
3. The five commands, with org scoping and audit rows like every other command.
4. Editor: "Save scene as template" and a template picker on an empty project.
5. Settings page to rename, delete, and set the default.
6. New projects apply the org default when one is set.

## What must not break

- Every Prisma call filters by `orgId`; a template is never visible across orgs.
- Scenery must not reach a quote. A tree is not a line item.
- Applying a template writes through the command registry so it lands in the audit
  log and can be undone like anything else.
- An empty drawing plus a default template must not fight: the template applies once
  at creation, not on every open.
