import { describe, expect, it } from "vitest";
import {
  MATH_QUESTION_TYPES,
  answerMathQuestion,
  findNonInferableCubes,
  generateMathQuestion,
  generateMathWorksheet,
  getMathTeachingGuide,
  isCubeStructureUnambiguous,
} from "../src/index";

describe("math practice question generator", () => {
  it("generates every registered teaching type deterministically", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      for (let offset = 0; offset < 12; offset += 1) {
        const input = { typeId: definition.id, seed: 20260809 + offset };
        const first = generateMathQuestion(input);
        const second = generateMathQuestion(input);

        expect(first, definition.id).toEqual(second);
        expect(first.typeId).toBe(definition.id);
        expect(first.difficulty).toBeGreaterThanOrEqual(definition.difficultyRange[0]);
        expect(first.difficulty).toBeLessThanOrEqual(definition.difficultyRange[1]);
        expect(first.prompt.length).toBeGreaterThan(0);
        expect(first.answer.values.length).toBeGreaterThan(0);
        expect(first.explanation.length).toBeGreaterThan(0);
        const guide = getMathTeachingGuide(definition.id);
        expect(guide.focus.length, `${definition.id} teaching focus`).toBeGreaterThan(5);
        expect(guide.commonMistake.length, `${definition.id} common mistake`).toBeGreaterThan(5);
        expect(guide.hints, `${definition.id} progressive hints`).toHaveLength(2);
        expect(guide.hints.every((hint) => hint.length >= 8 && hint.length <= 40), `${definition.id} child hint length`).toBe(true);
        expect(answerMathQuestion(first, first.answer.values), definition.id).toBe(true);
      }
    }
  });

  it("rejects an incorrect response for every teaching type", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      const question = generateMathQuestion({ typeId: definition.id, seed: 99 });
      const wrong = [...question.answer.values];
      wrong[0] = `${wrong[0]}-not-correct`;
      expect(answerMathQuestion(question, wrong), definition.id).toBe(false);
    }
  });

  it("builds and shuffles a worksheet without changing its requested mix", () => {
    const worksheet = generateMathWorksheet({ N01: 3, C01: 2, V04: 4, S04: 1 }, 17);
    expect(worksheet).toHaveLength(10);
    expect(
      Object.fromEntries(
        ["N01", "C01", "V04", "S04"].map((typeId) => [
          typeId,
          worksheet.filter((question) => question.typeId === typeId).length,
        ]),
      ),
    ).toEqual({ N01: 3, C01: 2, V04: 4, S04: 1 });
    expect(worksheet).toEqual(generateMathWorksheet({ N01: 3, C01: 2, V04: 4, S04: 1 }, 17));
  });

  it("keeps repeated counting questions unique and rotates picture materials", () => {
    const worksheet = generateMathWorksheet({ N01: 20 }, 20260810);
    const signatures = worksheet.map((question) => JSON.stringify([
      question.prompt,
      question.visual,
      question.answer.values,
    ]));
    const assets = new Set(worksheet.flatMap((question) =>
      question.visual.kind === "OBJECT_GROUPS" ? [question.visual.asset] : [],
    ));

    expect(new Set(signatures).size).toBe(worksheet.length);
    expect(assets.size).toBeGreaterThanOrEqual(6);
  });

  it("varies both tens bundles and loose sticks for picture number reading", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 160; seed += 1) {
      const question = generateMathQuestion({ typeId: "P01", seed });
      expect(question.prompt).toBe("看图写数。");
      expect(question.visual.kind).toBe("PLACE_VALUE");
      if (question.visual.kind !== "PLACE_VALUE") continue;
      expect(question.visual.tens).toBeGreaterThanOrEqual(0);
      expect(question.visual.tens).toBeLessThanOrEqual(9);
      expect(question.visual.ones).toBeGreaterThanOrEqual(0);
      expect(question.visual.ones).toBeLessThanOrEqual(9);
      expect(question.visual.tens + question.visual.ones).toBeGreaterThan(0);
      expect(question.visual.showLabels).toBe(false);
      expect(question.answer.values).toEqual([String(question.visual.tens * 10 + question.visual.ones)]);
      seen.add(`${question.visual.tens}-${question.visual.ones}`);
    }
    expect(new Set(Array.from(seen, (signature) => signature.split("-")[0])).size).toBeGreaterThan(1);
    expect(new Set(Array.from(seen, (signature) => signature.split("-")[1])).size).toBeGreaterThan(1);
  });

  it("keeps P02 saved settings as an alias of the merged P01 exercise", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const canonical = generateMathQuestion({ typeId: "P01", seed });
      const legacy = generateMathQuestion({ typeId: "P02", seed });
      expect(legacy.prompt).toBe(canonical.prompt);
      expect(legacy.visual).toEqual(canonical.visual);
      expect(legacy.answer).toEqual(canonical.answer);
    }
  });

  it("varies P03 tens and ones and renders the answers inside a two-branch model", () => {
    const tensSeen = new Set<number>();
    const onesSeen = new Set<number>();
    for (let seed = 1; seed <= 240; seed += 1) {
      const question = generateMathQuestion({ typeId: "P03", seed });
      expect(question.prompt).toBe("把这个数分成几个十和几个一。");
      expect(question.visual.kind).toBe("NUMBER_BOND");
      if (question.visual.kind !== "NUMBER_BOND") continue;
      const total = question.visual.total;
      expect(total).not.toBeNull();
      const tens = Number(question.answer.values[0]);
      const ones = Number(question.answer.values[1]);
      expect(tens).toBeGreaterThanOrEqual(1);
      expect(tens).toBeLessThanOrEqual(9);
      expect(ones).toBeGreaterThanOrEqual(0);
      expect(ones).toBeLessThanOrEqual(9);
      expect(total).toBe(tens * 10 + ones);
      expect(question.visual.parts).toEqual([null, null]);
      expect(question.response.slotLabels).toEqual(["几个十", "几个一"]);
      tensSeen.add(tens);
      onesSeen.add(ones);
    }
    expect(tensSeen.size).toBe(9);
    expect(onesSeen.size).toBe(10);
  });

  it("varies P07 tens conditions instead of fixing every question at one ten", () => {
    const tensSeen = new Set<number>();
    const questions = Array.from({ length: 240 }, (_, index) =>
      generateMathQuestion({ typeId: "P07", seed: index + 1, difficulty: index % 2 === 0 ? 2 : 3 }),
    );

    for (const question of questions) {
      expect(question.visual).toMatchObject({ kind: "ABACUS", ones: 0 });
      const match = question.prompt.match(/十位上是 (\d+)，个位比十位多 (\d+)/);
      expect(match).not.toBeNull();
      if (!match) continue;
      const tens = Number(match[1]);
      const difference = Number(match[2]);
      expect(question.visual.kind).toBe("ABACUS");
      if (question.visual.kind === "ABACUS") expect(question.visual.tens).toBe(tens);
      const answer = Number(question.answer.values[0]);
      const base = tens * 10 + tens + difference;
      expect(answer).toBe(question.prompt.includes("添 1 颗") ? base + 1 : base);
      tensSeen.add(tens);
    }

    expect(tensSeen.size).toBeGreaterThan(4);
  });

  it("keeps P04 saved settings as an alias of the merged P03 exercise", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const canonical = generateMathQuestion({ typeId: "P03", seed });
      const legacy = generateMathQuestion({ typeId: "P04", seed });
      expect(legacy.prompt).toBe(canonical.prompt);
      expect(legacy.visual).toEqual(canonical.visual);
      expect(legacy.response).toEqual(canonical.response);
      expect(legacy.answer).toEqual(canonical.answer);
    }
  });

  it("renders C05 as four standard 20-within number-bond trees", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const question = generateMathQuestion({ typeId: "C05", seed, difficulty: 2 });
      expect(question.visual.kind).toBe("NUMBER_BOND_SET");
      if (question.visual.kind !== "NUMBER_BOND_SET") continue;

      expect(question.visual.bonds).toHaveLength(4);
      expect(question.response.slots).toBe(4);
      expect(question.answer.values).toHaveLength(4);

      question.visual.bonds.forEach((bond, index) => {
        const values = [bond.total, ...bond.parts];
        expect(values.filter((value) => value === null)).toHaveLength(1);
        const total = bond.total ?? Number(question.answer.values[index]);
        const left = bond.parts[0] ?? Number(question.answer.values[index]);
        const right = bond.parts[1] ?? Number(question.answer.values[index]);
        expect(total).toBeGreaterThanOrEqual(10);
        expect(total).toBeLessThanOrEqual(20);
        expect(left + right).toBe(total);
      });
    }
  });

  it("keeps N02 wording stable when containers wrap across rows", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const question = generateMathQuestion({ typeId: "N02", seed });
      expect(question.prompt).toMatch(/^第 \d+ 组里有几个？$/);
      expect(question.prompt).not.toMatch(/左|右/);
      expect(question.explanation).not.toMatch(/左|右/);
      expect(question.visual.kind).toBe("OBJECT_GROUPS");
      if (question.visual.kind !== "OBJECT_GROUPS") continue;
      expect(question.visual.containers).toBe(true);
      expect(question.visual.groups.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("labels N10 three-group choices with A, B and C", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const question = generateMathQuestion({ typeId: "N10", seed, difficulty: 3 });
      expect(question.response.options).toEqual(["A", "B", "C"]);
      expect(question.answer.values).toHaveLength(1);
      expect(question.answer.values[0]).toMatch(/^[ABC]$/);
      expect(question.prompt).not.toContain("中间");
      expect(question.explanation).not.toContain("中间");
      expect(question.visual.kind).toBe("OBJECT_GROUPS");
      if (question.visual.kind !== "OBJECT_GROUPS") continue;
      expect(question.visual.groupLabels).toEqual(["A", "B", "C"]);
    }
  });

  it("uses program coordinates as the source of truth for cube counting", () => {
    const structures = new Set<string>();
    for (let seed = 1; seed <= 400; seed += 1) {
      const question = generateMathQuestion({ typeId: "S04", seed });
      expect(question.visual.kind).toBe("CUBES");
      if (question.visual.kind !== "CUBES") continue;
      expect(question.answer.values).toEqual([String(question.visual.cubes.length)]);
      expect(new Set(question.visual.cubes.map((cube) => cube.join(","))).size).toBe(question.visual.cubes.length);
      expect(isCubeStructureUnambiguous(question.visual.cubes), `S04 seed ${seed}`).toBe(true);
      structures.add(JSON.stringify(question.visual.cubes));
    }
    expect(structures.size).toBeGreaterThan(5);
  });

  it("rejects hidden cubes that cannot be inferred from an upper cube", () => {
    const ambiguousStructure = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
    ] as const;
    const inferableStack = [
      [0, 0, 0],
      [0, 0, 1],
    ] as const;

    expect(findNonInferableCubes(ambiguousStructure)).toEqual([[0, 0, 0]]);
    expect(isCubeStructureUnambiguous(ambiguousStructure)).toBe(false);
    expect(isCubeStructureUnambiguous(inferableStack)).toBe(true);
  });

  it("progresses every requested type through its supported difficulty range", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      const worksheet = generateMathWorksheet({ [definition.id]: 10 }, 20260809);
      const [minimum, maximum] = definition.difficultyRange;
      const expected = minimum === 1 && maximum === 3
        ? [1, 1, 1, 2, 2, 2, 2, 2, 3, 3]
        : minimum === 1 && maximum === 2
          ? [1, 1, 1, 1, 1, 2, 2, 2, 2, 2]
          : [2, 2, 2, 2, 2, 2, 2, 3, 3, 3];
      expect(worksheet.map((question) => question.difficulty), definition.id).toEqual(expected);
    }

    const worksheet = generateMathWorksheet({ S04: 10 }, 20260809);
    expect(worksheet.map((question) => question.difficulty)).toEqual([
      1, 1, 1, 2, 2, 2, 2, 2, 3, 3,
    ]);
    for (const question of worksheet) {
      expect(question.visual.kind).toBe("CUBES");
      if (question.visual.kind !== "CUBES") continue;
      const maxHeight = Math.max(...question.visual.cubes.map(([, , z]) => z));
      if (question.difficulty === 1) {
        expect(question.visual.cubes.length).toBeLessThanOrEqual(4);
        expect(maxHeight).toBeLessThanOrEqual(1);
      }
      if (question.difficulty === 3) expect(maxHeight).toBeLessThanOrEqual(2);
    }
  });

  it("keeps direct random questions near the intended easy-medium-hard mix", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      const counts = new Map<number, number>();
      for (let seed = 1; seed <= 600; seed += 1) {
        const difficulty = generateMathQuestion({ typeId: definition.id, seed }).difficulty!;
        counts.set(difficulty, (counts.get(difficulty) ?? 0) + 1);
      }
      const [minimum, maximum] = definition.difficultyRange;
      if (minimum === 1 && maximum === 3) {
        expect(counts.get(1), `${definition.id} easy share`).toBeGreaterThan(140);
        expect(counts.get(1), `${definition.id} easy share`).toBeLessThan(220);
        expect(counts.get(2), `${definition.id} medium share`).toBeGreaterThan(250);
        expect(counts.get(2), `${definition.id} medium share`).toBeLessThan(350);
        expect(counts.get(3), `${definition.id} hard share`).toBeGreaterThan(80);
        expect(counts.get(3), `${definition.id} hard share`).toBeLessThan(160);
      } else {
        expect(counts.get(minimum), `${definition.id} lower share`).toBeGreaterThan(210);
        expect(counts.get(minimum), `${definition.id} lower share`).toBeLessThan(450);
        expect(counts.get(maximum), `${definition.id} upper share`).toBeGreaterThan(150);
        expect(counts.get(maximum), `${definition.id} upper share`).toBeLessThan(390);
      }
    }
  });

  it("changes the reasoning load, not only the numbers, on multi-level types", () => {
    const sequenceEasy = generateMathQuestion({ typeId: "N07", seed: 11, difficulty: 1 });
    const sequenceHard = generateMathQuestion({ typeId: "N07", seed: 11, difficulty: 3 });
    expect(sequenceEasy.response.slots).toBe(1);
    expect(sequenceHard.response.slots).toBe(2);
    expect(sequenceEasy.explanation).toContain("1");
    expect(sequenceHard.explanation).toContain("2");

    expect(generateMathQuestion({ typeId: "N09", seed: 11, difficulty: 1 }).response.options).toHaveLength(3);
    expect(generateMathQuestion({ typeId: "N09", seed: 11, difficulty: 3 }).response.options).toHaveLength(5);

    const chainEasy = generateMathQuestion({ typeId: "V03", seed: 11, difficulty: 1 });
    const chainHard = generateMathQuestion({ typeId: "V03", seed: 11, difficulty: 3 });
    expect(chainEasy.visual.kind === "OBJECT_GROUPS" && chainEasy.visual.groups).toHaveLength(3);
    expect(chainHard.visual.kind === "OBJECT_GROUPS" && chainHard.visual.groups).toHaveLength(3);
    expect(Number(chainEasy.answer.values.at(-1))).toBeLessThanOrEqual(10);
    expect(Number(chainHard.answer.values.at(-1))).toBeGreaterThanOrEqual(17);

    const factsLower = generateMathQuestion({ typeId: "V07", seed: 11, difficulty: 2 });
    const factsUpper = generateMathQuestion({ typeId: "V07", seed: 11, difficulty: 3 });
    expect(factsLower.response.equationRows).toBe(2);
    expect(factsUpper.response.equationRows).toBe(4);

    const spatialEasy = generateMathQuestion({ typeId: "S02", seed: 11, difficulty: 1 });
    const spatialHard = generateMathQuestion({ typeId: "S02", seed: 11, difficulty: 3 });
    expect(spatialEasy.visual.kind === "SPATIAL_GRID" && spatialEasy.visual.cells).toHaveLength(2);
    expect(spatialHard.visual.kind === "SPATIAL_GRID" && spatialHard.visual.cells.flat()).toHaveLength(6);
    expect(spatialHard.visual.kind === "SPATIAL_GRID" && spatialHard.visual.cells.flat().every(Boolean)).toBe(true);

    const logicLower = generateMathQuestion({ typeId: "S03", seed: 11, difficulty: 2 });
    const logicUpper = generateMathQuestion({ typeId: "S03", seed: 11, difficulty: 3 });
    expect(logicLower.visual.kind === "LOGIC_GRID" && logicLower.visual.rows).toHaveLength(4);
    expect(logicUpper.visual.kind === "LOGIC_GRID" && logicUpper.visual.rows).toHaveLength(5);
  });

  it("builds V07 as two editable equations for equal groups and four otherwise", () => {
    const questions = Array.from({ length: 80 }, (_, seed) =>
      generateMathQuestion({ typeId: "V07", seed: seed + 1 }),
    );
    const equal = questions.find((question) => {
      return question.visual.kind === "OBJECT_GROUPS" && question.visual.groups[0] === question.visual.groups[1];
    });
    const different = questions.find((question) => {
      return question.visual.kind === "OBJECT_GROUPS" && question.visual.groups[0] !== question.visual.groups[1];
    });

    expect(equal?.response.equationRows).toBe(2);
    expect(equal?.answer.values).toHaveLength(8);
    expect(different?.response.equationRows).toBe(4);
    expect(different?.answer.values).toHaveLength(16);
    expect(equal?.response.maxDigits).toBe(1);
    expect(different?.response.maxDigits).toBe(1);
    expect(equal?.response.options).toBeUndefined();
    expect(different?.response.options).toBeUndefined();
    expect(equal?.visual.kind === "OBJECT_GROUPS" && equal.visual.totalLabel).toBeUndefined();

    if (!different) throw new Error("missing different-group V07 fixture");
    const rows = Array.from({ length: 4 }, (_, index) => different.answer.values.slice(index * 4, index * 4 + 4));
    expect(answerMathQuestion(different, rows.reverse().flat())).toBe(true);
  });

  it("keeps every V07 operand and result within one digit", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const generated = generateMathQuestion({ typeId: "V07", seed });
      for (const value of generated.answer.values) {
        if (value === "+" || value === "-") continue;
        expect(Number(value)).toBeGreaterThanOrEqual(0);
        expect(Number(value)).toBeLessThanOrEqual(9);
        expect(value).toHaveLength(1);
      }
    }
  });

  it("varies V07 sprites and group layouts deterministically", () => {
    const assets = new Set<string>();
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const question = generateMathQuestion({ typeId: "V07", seed });
      expect(question.visual.kind).toBe("OBJECT_GROUPS");
      if (question.visual.kind !== "OBJECT_GROUPS") continue;
      assets.add(question.visual.asset);
      layouts.add(JSON.stringify(question.visual.groupColumns));
    }
    expect(assets.size).toBeGreaterThanOrEqual(4);
    expect(layouts.size).toBeGreaterThan(3);
  });

  it("keeps N06, N07 and N08 response controls isolated from V07 equations", () => {
    const adjacent = generateMathQuestion({ typeId: "N06", seed: 20260810 });
    const sequence = generateMathQuestion({ typeId: "N07", seed: 20260810, difficulty: 2 });
    const comparison = generateMathQuestion({ typeId: "N08", seed: 20260810 });

    expect(adjacent.response.slots).toBe(adjacent.answer.values.length);
    expect(["R01", "R02"]).toContain(adjacent.response.mode);
    expect(adjacent.response.options).toBeUndefined();
    expect(sequence.response).toMatchObject({ mode: "R02", slots: 2 });
    expect(sequence.response.options).toBeUndefined();
    expect(comparison.response).toMatchObject({ mode: "R03", slots: 3, options: [">", "<", "="] });
    expect(comparison.visual.kind).toBe("ARITHMETIC_LIST");
    expect(comparison.answer.values).toHaveLength(3);
    expect(comparison.response.options).not.toContain("2+2=4");
  });

  it("generates three bounded N08 comparisons with all comparison symbols", () => {
    for (const difficulty of [1, 2] as const) {
      const maximum = difficulty === 1 ? 10 : 20;
      for (let seed = 1; seed <= 80; seed += 1) {
        const question = generateMathQuestion({ typeId: "N08", seed, difficulty });
        expect(question.visual.kind).toBe("ARITHMETIC_LIST");
        if (question.visual.kind !== "ARITHMETIC_LIST") continue;
        expect(question.visual.items).toHaveLength(3);
        expect(question.answer.values).toEqual(expect.arrayContaining([">", "<", "="]));
        expect(new Set(question.answer.values)).toEqual(new Set([">", "<", "="]));
        question.visual.items.forEach((item, index) => {
          const [first, blank, second] = item.tokens;
          expect(typeof first).toBe("number");
          expect(typeof blank).toBe("object");
          expect(typeof second).toBe("number");
          expect(first).toBeGreaterThanOrEqual(0);
          expect(first).toBeLessThanOrEqual(maximum);
          expect(second).toBeGreaterThanOrEqual(0);
          expect(second).toBeLessThanOrEqual(maximum);
          const expected = first === second ? "=" : first! > second! ? ">" : "<";
          expect(expected).toBe(question.answer.values[index]);
        });
        expect(answerMathQuestion(question, question.answer.values)).toBe(true);
        expect(answerMathQuestion(question, question.answer.values.slice(0, 2))).toBe(false);
      }
    }
  });

  it("starts every N09 drag exercise in an unsorted order", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const question = generateMathQuestion({ typeId: "N09", seed });
      expect(question.response.mode).toBe("R08");
      expect(question.response.options).toHaveLength(question.difficulty === 1 ? 3 : question.difficulty === 2 ? 4 : 5);
      expect(question.response.options).not.toEqual(question.answer.values);
      expect(answerMathQuestion(question, question.answer.values)).toBe(true);
    }
  });

  it("changes the S03 picture puzzle on every consecutive preview seed", () => {
    let previousSignature = "";
    const pictureThemes = new Set<string>();
    for (let seed = 20260809; seed < 20260829; seed += 1) {
      const question = generateMathQuestion({ typeId: "S03", seed });
      expect(question.visual.kind).toBe("LOGIC_GRID");
      if (question.visual.kind !== "LOGIC_GRID") continue;
      const signature = JSON.stringify({
        rows: question.visual.rows,
        columns: question.visual.columns,
        clues: question.visual.clues,
      });
      pictureThemes.add(question.visual.columnAssets?.join(",") ?? "");
      expect(signature).not.toBe(previousSignature);
      previousSignature = signature;
      expect(question.visual.rowAssets).toHaveLength(question.difficulty === 2 ? 4 : 5);
      expect(question.visual.columnAssets).toHaveLength(3);
      expect(question.response.options).toBeUndefined();
      expect(new Set(question.answer.values.map((value) => value.split("-")[0])).size).toBe(question.difficulty === 2 ? 4 : 5);
      expect(new Set(question.answer.values.map((value) => value.split("-")[1])).size).toBe(3);
      expect(question.answer.values).toHaveLength(question.difficulty === 2 ? 4 : 5);
    }
    expect(pictureThemes.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps every option answer selectable and every editable response complete", () => {
    for (const definition of MATH_QUESTION_TYPES) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const question = generateMathQuestion({ typeId: definition.id, seed });
        const options = question.response.options;
        if (options) {
          expect(new Set(options).size, `${definition.id} duplicate options`).toBe(options.length);
          for (const answer of question.answer.values) {
            expect(options, `${definition.id} answer ${answer} missing from options`).toContain(answer);
          }
        } else if (question.typeId !== "S03") {
          expect(question.response.slots, `${definition.id} slot count`).toBe(question.answer.values.length);
        }
      }
    }
  });

  it("generates varied questions for types that previously repeated unchanged", () => {
    for (const typeId of ["N05", "N11", "P06", "S01", "S02"] as const) {
      const signatures = new Set(
        Array.from({ length: 40 }, (_, seed) => {
          const question = generateMathQuestion({ typeId, seed: seed + 1 });
          return JSON.stringify({ prompt: question.prompt, visual: question.visual, options: question.response.options });
        }),
      );
      expect(signatures.size, typeId).toBeGreaterThanOrEqual(typeId === "P06" ? 2 : 8);
    }
  });

  it("varies P06 fixed-bead counts from one through three", () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 240; seed += 1) {
      const question = generateMathQuestion({ typeId: "P06", seed });
      const match = question.prompt.match(/把 (\d+) 颗珠子/);
      expect(match).not.toBeNull();
      if (!match) continue;
      const beadCount = Number(match[1]);
      expect(beadCount).toBeGreaterThanOrEqual(1);
      expect(beadCount).toBeLessThanOrEqual(3);
      expect(question.answer.values).toEqual(
        Array.from({ length: beadCount + 1 }, (_, tens) => String(tens * 10 + beadCount - tens)),
      );
      expect(new Set(question.response.options).size).toBe(question.response.options?.length ?? 0);
      counts.add(beadCount);
    }
    expect(counts).toEqual(new Set([1, 2, 3]));
  });

  it("uses independently illustrated material sets for length comparison", () => {
    const longestByAsset = {
      rulers: "左边",
      crayons: "中间",
      ribbons: "右边",
      toothbrushes: "左边",
      paintbrushes: "中间",
      straws: "右边",
      spoons: "左边",
    } as const;
    const seen = new Set<string>();

    for (let seed = 1; seed <= 400; seed += 1) {
      const question = generateMathQuestion({ typeId: "N13", seed });
      if (question.visual.kind !== "ATTRIBUTE_COMPARE" || question.visual.attribute !== "LENGTH") continue;
      expect(question.visual.lengthAsset).toBeDefined();
      expect(question.visual.scales).toEqual([1, 1, 1]);
      const asset = question.visual.lengthAsset!;
      seen.add(asset);
      const longestIndex = ["rulers", "toothbrushes", "spoons"].includes(asset)
        ? 0
        : ["crayons", "paintbrushes"].includes(asset)
          ? 1
          : 2;
      const shortestIndex = (longestIndex + 2) % 3;
      const middleIndex = [0, 1, 2].find((index) => index !== longestIndex && index !== shortestIndex)!;
      const answerIndex = question.prompt.includes("最长") ? longestIndex : question.prompt.includes("最短") ? shortestIndex : middleIndex;
      const locations = question.visual.lengthOrientation === "VERTICAL" ? ["上面", "中间", "下面"] : ["左边", "中间", "右边"];
      expect(question.answer.values).toEqual([locations[answerIndex]]);
      expect(question.visual.lengthOrientation).toMatch(/HORIZONTAL|VERTICAL/);
    }

    expect(seen).toEqual(new Set(Object.keys(longestByAsset)));
  });

  it("varies N11 and N12 question directions, assets, and visible differences", () => {
    for (const typeId of ["N11", "N12"] as const) {
      const asks = new Set<string>();
      const assets = new Set<string>();
      for (let seed = 1; seed <= 400; seed += 1) {
        const question = generateMathQuestion({ typeId, seed });
        expect(question.visual.kind).toBe("ATTRIBUTE_COMPARE");
        if (question.visual.kind !== "ATTRIBUTE_COMPARE") continue;
        assets.add(question.visual.asset);
        const ask = question.prompt.includes("最大") || question.prompt.includes("最高")
          ? "MAX"
          : question.prompt.includes("最小") || question.prompt.includes("最矮")
            ? "MIN"
            : "MIDDLE";
        asks.add(ask);
        const sorted = [...question.visual.scales].sort((left, right) => left - right);
        expect(sorted[2]! - sorted[0]!).toBeGreaterThanOrEqual(0.6);
        const target = ask === "MAX" ? Math.max(...question.visual.scales) : ask === "MIN" ? Math.min(...question.visual.scales) : sorted[1]!;
        expect(question.answer.values).toEqual([["左边", "中间", "右边"][question.visual.scales.indexOf(target)]]);
      }
      expect(asks).toEqual(new Set(["MAX", "MIN", "MIDDLE"]));
      expect(assets.size).toBeGreaterThanOrEqual(5);
    }
  });

  it("adds scale scenes, equal-weight cases, and light/heavy wording to N14", () => {
    const scenes = new Set<string>();
    const prompts = new Set<string>();
    for (let seed = 1; seed <= 500; seed += 1) {
      const question = generateMathQuestion({ typeId: "N14", seed });
      expect(question.visual.kind).toBe("ATTRIBUTE_COMPARE");
      if (question.visual.kind !== "ATTRIBUTE_COMPARE") continue;
      scenes.add(question.visual.balanceType ?? "SEESAW");
      expect(question.visual.assets).toHaveLength(2);
      const ask = question.prompt.includes("更轻") ? "LIGHTER" : "HEAVIER";
      expect(question.response.options).toEqual(ask === "HEAVIER" ? ["左边重", "右边重", "一样重"] : ["左边轻", "右边轻", "一样重"]);
      prompts.add(ask);
      if (question.visual.balance === "EQUAL") {
        expect(question.prompt).toMatch(/哪一边的物体更(重|轻)？/);
        expect(question.answer.values).toEqual(["一样重"]);
      } else {
        expect(question.visual.weights).toEqual(question.visual.balance === "LEFT" ? [3, 1] : [1, 3]);
      }
    }
    expect(scenes).toEqual(new Set(["SEESAW", "SCALE"]));
    expect(prompts).toEqual(new Set(["LIGHTER", "HEAVIER"]));
  });

  it("keeps N05 front and behind counts consistent with the travel direction", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const question = generateMathQuestion({ typeId: "N05", seed });
      expect(question.visual.kind).toBe("QUEUE");
      if (question.visual.kind !== "QUEUE") continue;
      expect(question.visual.showIndices).toBe(false);
      const targetIndex = question.visual.targetIndex!;
      const frontCount = question.visual.direction === "RIGHT"
        ? question.visual.assets.length - targetIndex - 1
        : targetIndex;
      const expected = question.prompt.includes("前面")
        ? frontCount
        : question.visual.assets.length - frontCount - 1;
      expect(question.answer.values).toEqual([String(expected)]);
    }
  });

  it("makes S01 a direct picture choice without answer-revealing markers", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const question = generateMathQuestion({ typeId: "S01", seed });
      expect(question.visual.kind).toBe("QUEUE");
      if (question.visual.kind !== "QUEUE") continue;
      expect(question.visual.selectable).toBe(true);
      expect(question.visual.showIndices).toBe(false);
      expect(question.visual.targetIndex).toBeUndefined();
      expect(question.visual.direction).toBeUndefined();
      expect(question.response.options?.length).toBeGreaterThan(1);
    }
  });

  it("generates all three adjacent-number variants and valid patterned gaps", () => {
    const twentyMissingIndexes = new Set<number>();
    const multiDirections = new Set<number>();
    const multiSteps = new Set<number>();

    for (let seed = 1; seed <= 80; seed += 1) {
      const adjacentWithinTen = generateMathQuestion({ typeId: "N06", seed, difficulty: 1 });
      expect(adjacentWithinTen.visual.kind).toBe("NUMBER_BOXES");
      if (adjacentWithinTen.visual.kind === "NUMBER_BOXES") {
        expect(adjacentWithinTen.visual.values).toHaveLength(3);
        expect(adjacentWithinTen.answer.values).toHaveLength(1);
        expect(adjacentWithinTen.visual.values.filter((value) => value !== null)).toHaveLength(2);
        const rebuilt = [...adjacentWithinTen.visual.values];
        let answerIndex = 0;
        for (let index = 0; index < rebuilt.length; index += 1) {
          if (rebuilt[index] === null) rebuilt[index] = Number(adjacentWithinTen.answer.values[answerIndex++]);
        }
        expect(Math.min(...rebuilt as number[])).toBeGreaterThanOrEqual(1);
        expect(Math.max(...rebuilt as number[])).toBeLessThanOrEqual(10);
        expect(rebuilt[1]! - rebuilt[0]!).toBe(1);
        expect(rebuilt[2]! - rebuilt[1]!).toBe(1);
      }

      const adjacentWithinTwenty = generateMathQuestion({ typeId: "N06", seed, difficulty: 2 });
      expect(adjacentWithinTwenty.visual.kind).toBe("NUMBER_BOXES");
      if (adjacentWithinTwenty.visual.kind === "NUMBER_BOXES") {
        expect(adjacentWithinTwenty.visual.values).toHaveLength(3);
        expect(adjacentWithinTwenty.answer.values).toHaveLength(1);
        expect(adjacentWithinTwenty.visual.values.filter((value) => value !== null)).toHaveLength(2);
        twentyMissingIndexes.add(adjacentWithinTwenty.visual.values.findIndex((value) => value === null));
        const rebuilt = [...adjacentWithinTwenty.visual.values];
        let answerIndex = 0;
        for (let index = 0; index < rebuilt.length; index += 1) {
          if (rebuilt[index] === null) rebuilt[index] = Number(adjacentWithinTwenty.answer.values[answerIndex++]);
        }
        expect(Math.min(...rebuilt as number[])).toBeGreaterThanOrEqual(1);
        expect(Math.max(...rebuilt as number[])).toBeLessThanOrEqual(20);
        expect(rebuilt[1]! - rebuilt[0]!).toBe(1);
        expect(rebuilt[2]! - rebuilt[1]!).toBe(1);
      }

      const adjacentMulti = generateMathQuestion({ typeId: "N06", seed, difficulty: 3 });
      expect(adjacentMulti.visual.kind).toBe("NUMBER_BOXES");
      if (adjacentMulti.visual.kind === "NUMBER_BOXES") {
        expect(adjacentMulti.visual.values).toHaveLength(5);
        expect(adjacentMulti.answer.values).toHaveLength(2);
        const rebuilt = [...adjacentMulti.visual.values];
        let answerIndex = 0;
        for (let index = 0; index < rebuilt.length; index += 1) {
          if (rebuilt[index] === null) rebuilt[index] = Number(adjacentMulti.answer.values[answerIndex++]);
        }
        const gaps = rebuilt.slice(1).map((value, index) => value! - rebuilt[index]!);
        expect(new Set(gaps).size).toBe(1);
        expect([1, 2, 3, 4]).toContain(Math.abs(gaps[0]!));
        expect(Math.min(...rebuilt as number[])).toBeGreaterThanOrEqual(1);
        expect(Math.max(...rebuilt as number[])).toBeLessThanOrEqual(20);
        multiDirections.add(Math.sign(gaps[0]!));
        multiSteps.add(Math.abs(gaps[0]!));
      }

      const sequence = generateMathQuestion({ typeId: "N07", seed });
      expect(sequence.visual.kind).toBe("NUMBER_BOXES");
      if (sequence.visual.kind === "NUMBER_BOXES") {
        const rebuilt = [...sequence.visual.values];
        let answerIndex = 0;
        for (let index = 0; index < rebuilt.length; index += 1) {
          if (rebuilt[index] === null) rebuilt[index] = Number(sequence.answer.values[answerIndex++]);
        }
        const gaps = rebuilt.slice(1).map((value, index) => value! - rebuilt[index]!);
        expect(new Set(gaps).size).toBe(1);
        expect([1, 2]).toContain(Math.abs(gaps[0]!));
      }
    }

    expect(twentyMissingIndexes).toEqual(new Set([0, 1, 2]));
    expect(multiDirections).toEqual(new Set([1, -1]));
    expect(multiSteps).toEqual(new Set([1, 2, 3, 4]));
  });

  it("covers both arithmetic signs and restores V06 equation entry", () => {
    const signs = new Set<string>();
    for (let seed = 1; seed <= 50; seed += 1) {
      signs.add(generateMathQuestion({ typeId: "C04", seed }).answer.values[0]!);
      const bracket = generateMathQuestion({ typeId: "V06", seed, difficulty: 1 });
      expect(bracket.response).toMatchObject({ mode: "R04", slots: 4 });
      expect(bracket.answer.values[1]).toBe("-");
    }
    expect(signs).toEqual(new Set(["+", "-"]));
  });

  it("does not repeat visible equations inside a C04 symbol-fill question", () => {
    for (const seed of [1, 17, 20260810]) {
      const question = generateMathQuestion({ typeId: "C04", seed, itemsPerQuestion: 20 });
      expect(question.visual.kind).toBe("ARITHMETIC_LIST");
      if (question.visual.kind !== "ARITHMETIC_LIST") continue;
      const signatures = question.visual.items.map((item) => item.tokens
        .filter((token): token is number => typeof token === "number")
        .join("|"));
      expect(new Set(signatures).size).toBe(signatures.length);
      expect(question.response).toMatchObject({ mode: "R04", slots: 20 });
    }
  });

  it("generates a configurable group of arithmetic items and keeps range rules", () => {
    const ids = ["C07", "C08", "C09", "C10", "C11", "C12", "C13", "C14", "C15"] as const;
    for (const typeId of ids) {
      const question = generateMathQuestion({ typeId, seed: 20260810, itemsPerQuestion: 6 });
      expect(question.visual.kind).toBe("ARITHMETIC_LIST");
      if (question.visual.kind !== "ARITHMETIC_LIST") continue;
      expect(question.visual.items).toHaveLength(6);
      expect(question.answer.values).toHaveLength(6);
      const maximum = ({ C07: 10, C08: 20, C09: 50, C10: 100, C11: 10, C12: 20, C13: 50, C14: 100, C15: 100 } as Record<string, number>)[typeId]!;
      for (const item of question.visual.items) {
        const [left, symbol, right] = item.tokens;
        expect(Number(left)).toBeLessThanOrEqual(maximum);
        expect(Number(right)).toBeLessThanOrEqual(maximum);
        expect(symbol === "+" || symbol === "-").toBe(true);
      }
    }
  });

  it("splits 100以内进位加法 and 退位减法 into single-operation types", () => {
    for (const seed of [1, 17, 20260810, 20260822]) {
      const addition = generateMathQuestion({ typeId: "C14", seed, itemsPerQuestion: 8 });
      const subtraction = generateMathQuestion({ typeId: "C15", seed, itemsPerQuestion: 8 });
      for (const [question, symbol, predicate] of [
        [addition, "+", (left: number, right: number) => left % 10 + right % 10 >= 10] as const,
        [subtraction, "-", (left: number, right: number) => left % 10 < right % 10] as const,
      ]) {
        expect(question.visual.kind).toBe("ARITHMETIC_LIST");
        if (question.visual.kind !== "ARITHMETIC_LIST") continue;
        for (const item of question.visual.items) {
          const [left, actualSymbol, right] = item.tokens;
          expect(actualSymbol).toBe(symbol);
          expect(predicate(Number(left), Number(right))).toBe(true);
        }
      }
    }
  });

  it("keeps spatial picture answers consistent with picture coordinates", () => {
    const labels = { chick: "小鸡", puppy: "小狗", apple: "苹果", pencil: "铅笔", watermelon: "西瓜", bear: "小熊", duck: "鸭子", cake: "蛋糕" } as const;
    for (let seed = 1; seed <= 80; seed += 1) {
      const question = generateMathQuestion({ typeId: "S02", seed });
      expect(question.visual.kind).toBe("SPATIAL_GRID");
      if (question.visual.kind !== "SPATIAL_GRID") continue;
      const targetLabel = question.prompt.split("在")[0]!;
      const anchorLabel = question.prompt.split("在")[1]!.split("的")[0]!;
      let targetPosition: [number, number] | null = null;
      let anchorPosition: [number, number] | null = null;
      question.visual.cells.forEach((row, rowIndex) => row.forEach((asset, columnIndex) => {
        if (asset && labels[asset] === targetLabel) targetPosition = [rowIndex, columnIndex];
        if (asset && labels[asset] === anchorLabel) anchorPosition = [rowIndex, columnIndex];
      }));
      expect(targetPosition).not.toBeNull();
      expect(anchorPosition).not.toBeNull();
      const [targetRow, targetColumn] = targetPosition!;
      const [anchorRow, anchorColumn] = anchorPosition!;
      const expected = targetColumn < anchorColumn ? "左边"
        : targetColumn > anchorColumn ? "右边"
        : targetRow < anchorRow ? "上面" : "下面";
      expect(question.answer.values).toEqual([expected]);
    }
  });

  it("keeps the four measurable attributes independently configurable", () => {
    expect(generateMathQuestion({ typeId: "N11", seed: 7 }).visual).toMatchObject({ kind: "ATTRIBUTE_COMPARE", attribute: "SIZE" });
    expect(generateMathQuestion({ typeId: "N12", seed: 7 }).visual).toMatchObject({ kind: "ATTRIBUTE_COMPARE", attribute: "HEIGHT" });
    expect(generateMathQuestion({ typeId: "N13", seed: 7 }).visual).toMatchObject({ kind: "ATTRIBUTE_COMPARE", attribute: "LENGTH" });
    expect(generateMathQuestion({ typeId: "N14", seed: 7 }).visual).toMatchObject({ kind: "ATTRIBUTE_COMPARE", attribute: "WEIGHT" });
  });

  it("builds direct-manipulation answers for ordered selection and quantity construction", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const selection = generateMathQuestion({ typeId: "N15", seed });
      expect(selection.visual).toMatchObject({ kind: "QUEUE", selectable: true });
      expect(selection.response).toMatchObject({ mode: "R06", multiSelect: true });
      expect(new Set(selection.answer.values).size).toBe(selection.answer.values.length);
      expect(answerMathQuestion(selection, [...selection.answer.values].reverse())).toBe(true);

      const drawing = generateMathQuestion({ typeId: "N16", seed });
      expect(drawing.visual.kind).toBe("COUNT_ADJUST");
      expect(drawing.prompt).not.toMatch(/上面|下面|左边|右边/);
      expect(drawing.prompt).toContain("参考数量");
      if (drawing.visual.kind === "COUNT_ADJUST") {
        const expected = drawing.visual.relation === "MORE"
          ? drawing.visual.referenceCount + drawing.visual.difference
          : drawing.visual.referenceCount - drawing.visual.difference;
        expect(drawing.answer.values).toEqual([String(expected)]);
      }
    }
  });

  it("keeps directional wording tied to a stable visual layout", () => {
    for (let seed = 1; seed <= 80; seed += 1) {
      const grouped = generateMathQuestion({ typeId: "N02", seed });
      expect(grouped.prompt).toMatch(/^第 \d+ 组里有几个？$/);
      expect(grouped.visual).toMatchObject({ kind: "OBJECT_GROUPS", containers: true });

      const quantity = generateMathQuestion({ typeId: "N10", seed, difficulty: 2 });
      expect(quantity.visual).toMatchObject({ kind: "OBJECT_GROUPS", orientation: "VERTICAL", groupLabels: ["上面", "下面"] });
      expect(quantity.prompt).toContain("上面");
      expect(quantity.prompt).toContain("下面");

      const constructed = generateMathQuestion({ typeId: "N16", seed });
      expect(constructed.prompt).not.toMatch(/上面|下面|左边|右边/);
      expect(constructed.prompt).toContain("参考数量");

      for (const typeId of ["N04", "N05", "N15", "S01"] as const) {
        const question = generateMathQuestion({ typeId, seed });
        expect(question.visual.kind, typeId).toBe("QUEUE");
        expect(question.prompt, typeId).toMatch(/左|右/);
      }
    }
  });

  it("covers comparison-unknown, start-unknown and true one-dimensional position stories", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const comparison = generateMathQuestion({ typeId: "W08", seed });
      const start = generateMathQuestion({ typeId: "W09", seed });
      const position = generateMathQuestion({ typeId: "S05", seed });
      expect(comparison.answer.values).toHaveLength(4);
      expect(start.answer.values).toHaveLength(4);
      expect(position.answer.values[0]).toMatch(/左边|右边/);
      expect(position.visual.kind).toBe("QUEUE");
      if (position.visual.kind === "QUEUE") expect(position.visual.showIndices).toBe(false);
    }
  });
});
