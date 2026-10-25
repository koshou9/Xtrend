import { describe, expect, it } from "vitest";
import { connectionPath, intersectBoxes } from "../src/core/connection";
import { Workspace } from "../src/content/model";
import { defaultSettings } from "../src/core/settings";
import { fixtureTweets } from "./fixtures";

describe("visible connection geometry", () => {
  it("connects the facing edges of a post and a panel to its right", () => {
    const result = connectionPath(
      { left: 10, top: 20, right: 400, bottom: 200 },
      { left: 600, top: 300, right: 900, bottom: 340 },
    );
    expect(result.start).toEqual({ x: 400, y: 188 });
    expect(result.end).toEqual({ x: 600, y: 320 });
    expect(result.path).toContain(" C ");
  });
  it("mirrors the connection for a left-side panel", () => {
    const result = connectionPath(
      { left: 600, top: 20, right: 900, bottom: 300 },
      { left: 10, top: 100, right: 400, bottom: 140 },
    );
    expect(result.start).toEqual({ x: 600, y: 120 });
    expect(result.end).toEqual({ x: 400, y: 120 });
  });
  it("routes through the free strip when the floating panel covers part of the post", () => {
    const result = connectionPath(
      { left: 10, top: 20, right: 400, bottom: 200 },
      { left: 100, top: 300, right: 350, bottom: 340 },
    );
    expect(result.start.x).toBe(10);
    expect(result.end.x).toBe(100);
    expect(result.start.x).toBeLessThan(result.end.x);
  });
  it("clips to visible scroll-container boundaries without inventing an offscreen endpoint", () => {
    expect(
      intersectBoxes(
        { left: 20, top: -50, right: 400, bottom: 500 },
        { left: 0, top: 60, right: 300, bottom: 300 },
      ),
    ).toEqual({ left: 20, top: 60, right: 300, bottom: 300 });
    expect(
      intersectBoxes(
        { left: 20, top: 400, right: 400, bottom: 500 },
        { left: 0, top: 0, right: 300, bottom: 300 },
      ),
    ).toBeNull();
  });
});
describe("ephemeral post selection", () => {
  const storage = { async get() {}, async set() {}, async remove() {} };
  it("locates the post and replaces the previous selection without saving it", () => {
    let saves = 0,
      jumped = "";
    const model = new Workspace(
      defaultSettings("en"),
      storage,
      async () => {
        saves++;
      },
      {
        jump: (tweet) => {
          jumped = tweet.id;
          return true;
        },
        back() {},
        fill: () => false,
      },
    );
    try {
      const tweets = fixtureTweets();
      model.locate(tweets[0]!);
      model.locate(tweets[1]!);
      expect(jumped).toBe(tweets[1]!.id);
      expect(model.snapshot().selectedTweetId).toBe(jumped);
      expect(saves).toBe(0);
      model.clearSelection();
      expect(model.snapshot().selectedTweetId).toBeNull();
    } finally {
      model.destroy();
    }
  });
  it("does not retain an old line when the target cannot be found", () => {
    let found = true;
    const model = new Workspace(
      defaultSettings("en"),
      storage,
      async () => {},
      { jump: () => found, back() {}, fill: () => false },
    );
    try {
      model.locate(fixtureTweets()[0]!);
      found = false;
      expect(model.locate(fixtureTweets()[1]!)).toBe(false);
      expect(model.snapshot().selectedTweetId).toBeNull();
    } finally {
      model.destroy();
    }
  });
  it("clears the selection when page data resets", () => {
    const model = new Workspace(
      defaultSettings("en"),
      storage,
      async () => {},
      { jump: () => true, back() {}, fill: () => false },
    );
    try {
      model.locate(fixtureTweets()[0]!);
      model.reset();
      expect(model.snapshot().selectedTweetId).toBeNull();
    } finally {
      model.destroy();
    }
  });
});
