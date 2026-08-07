# Star Monsters Assets

All project-owned visual assets live under this package.

- `images/`: source raster images imported by the applications.
- `icons/`: source SVG icons imported by the applications.
- `static/`: files copied to the child app public root, including app icons and runtime media paths.
- `references/`: Figma and QA reference images; these are not bundled.
- `generated/`: locally generated Hanzi and poem media. This directory is ignored by Git and is uploaded through the dedicated media deployment scripts.

Do not add application assets back to `apps/*/src/assets`, `apps/*/public/icons`, or `apps/*/public/pet-assets`. Update the relevant import or the child app `publicDir` configuration when adding a new asset.
