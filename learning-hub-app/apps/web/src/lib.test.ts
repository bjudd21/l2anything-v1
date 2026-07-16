import { describe, expect, it } from "vitest";
import { titleFromMissionMessage } from "./lib.js";

describe("titleFromMissionMessage", () => {
  it("turns a transcript-like Japanese manga goal into a readable topic title", () => {
    expect(
      titleFromMissionMessage(
        "I want to learn to read mangas in japanese total beginner One Piece 5-10hrs a week depending on the week open ended starting from zero Im not sure, we could try different approaches and see if one works better than another nothing off limits looks good"
      )
    ).toBe("Learning to read manga in Japanese");
  });

  it("uses the learner purpose when the first message has a so-I-can goal", () => {
    expect(titleFromMissionMessage("I want to learn Japanese so I can read manga.")).toBe(
      "Learning to read manga in Japanese"
    );
  });
});
