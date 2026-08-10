# Math practice registry

`@star-monsters/math-practice` is the shared source of truth for the integrated
math-practice task. It contains the complete worksheet classification, seeded
question generators, answer checking, child-facing visual specifications and
the metadata consumed by the parent configuration page.

## Registry layers

- 50 teaching presentation types are organized into 8 curriculum-facing ability categories.
- 43 core generator ids represent distinct deterministic math generators.
- 8 response modes describe the child-facing answer controls independently of
  the question content.
- 8 curriculum categories provide the grouping used by the parent configuration
  page, worksheet builder and static preview catalogue.
- 6 legacy code domains remain stable so stored type ids and historical
  practice records continue to work.

| Curriculum category | Count | Scope |
| --- | ---: | --- |
| 数与数量 | 9 | Counting, number sequences, comparison and quantity construction |
| 数位与表征 | 7 | Number representation, place value and abacus |
| 量感比较 | 4 | Size, height, length and weight |
| 数的运算 | 14 | Multi-item arithmetic, number bonds and range/carry-borrow practice |
| 看图建模与列式 | 7 | Picture equations and visual arithmetic |
| 情境应用题 | 9 | Semantic word-problem structures |
| 顺序、方位与位置 | 6 | Ordinal, selection and relative position |
| 逻辑与立体空间 | 2 | Logic-grid reasoning and cube counting |

Each teaching type records its core generator, answer controls, visual strategy,
number range, difficulty range, source worksheet evidence and preview fixture.
Every registered type is available in the static child preview and in the
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
   of the registered teaching types.
2. The daily task stores a configuration snapshot so later template edits do
   not change a child's already-created assignment.
3. The API builds a deterministic worksheet from that snapshot and sends only
   answer-free question specifications to the child.
4. The child answers with large touch controls instead of the iPad system
   keyboard. A first error invites a retry; a second error explains and reveals
   the correct answer before continuing.
5. The existing task completion and star-reward flow runs only after every
   question has been settled.
