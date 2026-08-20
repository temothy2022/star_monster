import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { summarizeFeverEpisode } from "../src/services/fever-record-service.js";

function reading(id: string, recordedAt: string, temperature: number) {
  return {
    id,
    recordedAt: new Date(recordedAt),
    temperatureCelsius: new Prisma.Decimal(temperature),
    thermometerType: "EAR" as const,
    medicationUsed: false,
    antipyreticUsed: false,
    antipyreticKind: null,
    medicationNote: null,
    respiratoryRate: null,
    mentalState: null,
    sleepState: null,
    appetiteState: null,
    hydrationState: null,
    note: null,
    createdAt: new Date(recordedAt),
  };
}

describe("fever episode summary", () => {
  it("sorts readings and reports duration, peak and latest temperature", () => {
    const summary = summarizeFeverEpisode({
      id: "episode-1",
      startedAt: new Date("2026-08-20T00:00:00.000Z"),
      endedAt: new Date("2026-08-20T03:30:00.000Z"),
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T03:30:00.000Z"),
      readings: [
        reading("later", "2026-08-20T02:00:00.000Z", 38.2),
        reading("first", "2026-08-20T00:00:00.000Z", 39.1),
        reading("latest", "2026-08-20T03:00:00.000Z", 37.6),
      ],
    });

    expect(summary.durationMinutes).toBe(210);
    expect(summary.maximumTemperatureCelsius).toBe(39.1);
    expect(summary.latestTemperatureCelsius).toBe(37.6);
    expect(summary.readings.map((item) => item.id)).toEqual(["first", "later", "latest"]);
  });

  it("uses the current time for an active episode", () => {
    const summary = summarizeFeverEpisode({
      id: "episode-2",
      startedAt: new Date("2026-08-20T00:00:00.000Z"),
      endedAt: null,
      createdAt: new Date("2026-08-20T00:00:00.000Z"),
      updatedAt: new Date("2026-08-20T00:00:00.000Z"),
      readings: [reading("only", "2026-08-20T00:00:00.000Z", 38.5)],
    }, new Date("2026-08-20T01:15:00.000Z"));

    expect(summary.durationMinutes).toBe(75);
    expect(summary.readingCount).toBe(1);
  });
});
