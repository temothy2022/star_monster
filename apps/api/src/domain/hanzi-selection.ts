import { createHash } from "node:crypto";

function dailyRank(seed: string, characterId: string) {
  return createHash("sha256")
    .update(seed)
    .update("\0")
    .update(characterId)
    .digest("hex");
}

export function selectDailyHanziCharacters<T extends { id: string }>(
  characters: T[],
  count: number,
  seed: string,
): T[] {
  if (count <= 0 || characters.length === 0) return [];
  return characters
    .map((character) => ({
      character,
      rank: dailyRank(seed, character.id),
    }))
    .sort(
      (left, right) =>
        left.rank.localeCompare(right.rank) ||
        left.character.id.localeCompare(right.character.id),
    )
    .slice(0, count)
    .map(({ character }) => character);
}
