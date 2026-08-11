export type CubeCoordinate = readonly [x: number, y: number, z: number];

export type CubePoint = readonly [x: number, y: number];

export type ProjectedCube = {
  key: string;
  cube: CubeCoordinate;
  z: number;
  top: readonly CubePoint[];
  left: readonly CubePoint[];
  right: readonly CubePoint[];
  points: readonly CubePoint[];
};

type ProjectionOptions = {
  size?: number;
  originX?: number;
  originY?: number;
};

const coordinateKey = ([x, y, z]: CubeCoordinate) => `${x},${y},${z}`;

export function projectCubeStructure(
  cubes: readonly CubeCoordinate[],
  options: ProjectionOptions = {},
): ProjectedCube[] {
  const size = options.size ?? 36;
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;

  return cubes
    .map((cube, originalIndex) => ({ cube, originalIndex }))
    .sort((first, second) => {
      const firstDepth = first.cube[0] + first.cube[1] + first.cube[2] * 0.01;
      const secondDepth = second.cube[0] + second.cube[1] + second.cube[2] * 0.01;
      return firstDepth - secondDepth || first.originalIndex - second.originalIndex;
    })
    .map(({ cube: [x, y, z], originalIndex }) => {
      const px = originX + (x - y) * size;
      const py = originY + (x + y) * (size / 2) - z * size;
      const top = [
        [px, py - size],
        [px + size, py - size / 2],
        [px, py],
        [px - size, py - size / 2],
      ] as const;
      const left = [
        [px - size, py - size / 2],
        [px, py],
        [px, py + size],
        [px - size, py + size / 2],
      ] as const;
      const right = [
        [px, py],
        [px + size, py - size / 2],
        [px + size, py + size / 2],
        [px, py + size],
      ] as const;
      return {
        key: `${x}-${y}-${z}-${originalIndex}`,
        cube: [x, y, z] as const,
        z,
        top,
        left,
        right,
        points: [...top, ...left, ...right],
      };
    });
}

function pointInsideConvexPolygon([pointX, pointY]: CubePoint, polygon: readonly CubePoint[]) {
  let direction = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [startX, startY] = polygon[index]!;
    const [endX, endY] = polygon[(index + 1) % polygon.length]!;
    const cross = (endX - startX) * (pointY - startY) - (endY - startY) * (pointX - startX);
    if (Math.abs(cross) < 1e-7) continue;
    const nextDirection = Math.sign(cross);
    if (direction !== 0 && direction !== nextDirection) return false;
    direction = nextDirection;
  }
  return true;
}

function faceHasVisibleArea(face: readonly CubePoint[], occluders: readonly (readonly CubePoint[])[]) {
  const [origin, horizontal, , vertical] = face;
  if (!origin || !horizontal || !vertical) return false;
  const sampleCount = 8;

  // Cube edges share a fixed half-cell grid, so interior samples detect every
  // meaningful visible region while avoiding edge-only contact between faces.
  for (let horizontalIndex = 0; horizontalIndex < sampleCount; horizontalIndex += 1) {
    for (let verticalIndex = 0; verticalIndex < sampleCount; verticalIndex += 1) {
      const horizontalRatio = (horizontalIndex + 0.5) / sampleCount;
      const verticalRatio = (verticalIndex + 0.5) / sampleCount;
      const point = [
        origin[0]
          + (horizontal[0] - origin[0]) * horizontalRatio
          + (vertical[0] - origin[0]) * verticalRatio,
        origin[1]
          + (horizontal[1] - origin[1]) * horizontalRatio
          + (vertical[1] - origin[1]) * verticalRatio,
      ] as const;
      if (!occluders.some((polygon) => pointInsideConvexPolygon(point, polygon))) return true;
    }
  }

  return false;
}

export function findNonInferableCubes(cubes: readonly CubeCoordinate[]) {
  const projected = projectCubeStructure(cubes);
  const keys = new Set(cubes.map(coordinateKey));
  const nonInferable: CubeCoordinate[] = [];

  for (let index = 0; index < projected.length; index += 1) {
    const projectedCube = projected[index]!;
    const [x, y, z] = projectedCube.cube;
    const supported = z === 0 || keys.has(`${x},${y},${z - 1}`);
    if (!supported) {
      nonInferable.push(projectedCube.cube);
      continue;
    }

    const occluders = projected
      .slice(index + 1)
      .flatMap((cube) => [cube.top, cube.left, cube.right]);
    const visible = [projectedCube.top, projectedCube.left, projectedCube.right]
      .some((face) => faceHasVisibleArea(face, occluders));
    // A fully hidden cube is countable only when the cube directly above it
    // proves that support must exist at this coordinate.
    const provesItsExistence = keys.has(`${x},${y},${z + 1}`);
    if (!visible && !provesItsExistence) nonInferable.push(projectedCube.cube);
  }

  return nonInferable;
}

export function isCubeStructureUnambiguous(cubes: readonly CubeCoordinate[]) {
  return findNonInferableCubes(cubes).length === 0;
}
