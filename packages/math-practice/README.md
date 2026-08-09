# Math practice registry

`@star-monsters/math-practice` is the shared source of truth for the integrated
math-practice task. It contains the complete worksheet classification, seeded
question generators, answer checking, child-facing visual specifications and
the metadata consumed by the parent configuration page.

## Registry layers

- 42 teaching presentation types match the reviewed worksheets.
- 35 core generator ids represent distinct deterministic math generators.
- 8 response modes describe the child-facing answer controls independently of
  the question content.
- 6 domains provide the grouping used by the parent configuration page and the
  static preview catalogue.

| Domain | Count | Scope |
| --- | ---: | --- |
| N | 11 | Counting, order and comparison |
| P | 7 | Number representation, place value and abacus |
| C | 6 | Symbolic arithmetic |
| V | 7 | Picture equations and visual arithmetic |
| W | 7 | Word problems |
| S | 4 | Position, spatial reasoning and logic |

Each teaching type records its core generator, answer controls, visual strategy,
number range, difficulty range, source worksheet evidence and preview fixture.
Every one of the 42 types is available in the static child preview and in the
parent allocation controls.

## Important boundary

`sceneStrategy` describes how the illustration is produced. Any
quantity, grouping, position, place value, crossed-out item or cube structure
that changes the answer must be rendered from data. Generated artwork may only
provide reviewed single-object sprites and decorative material.

The cube-counting generator follows the same rule: it first creates a connected
3D coordinate set, calculates the answer from that set, and only then projects
the cubes into SVG faces. It never asks an image model to invent a countable
structure.

## Runtime flow

1. The parent chooses a total question count and allocates that total among any
   of the 42 teaching types.
2. The daily task stores a configuration snapshot so later template edits do
   not change a child's already-created assignment.
3. The API builds a deterministic worksheet from that snapshot and sends only
   answer-free question specifications to the child.
4. The child answers with large touch controls instead of the iPad system
   keyboard. A first error invites a retry; a second error explains and reveals
   the correct answer before continuing.
5. The existing task completion and star-reward flow runs only after every
   question has been settled.
