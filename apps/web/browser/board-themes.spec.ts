import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const board = JSON.parse(readFileSync(new URL("../../../presets/streamer-board.json", import.meta.url), "utf8"));

test("OBS updates a theme at the same game revision, keeps the camera space open, and plays one or two dice", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "The test explicitly checks 1080p and 720p broadcast canvases.");
  await page.setViewportSize({ width: 1920, height: 1080 });
  const state: any = {
    channelId: "synthetic-channel",
    session: { id: "synthetic-session", channelId: "synthetic-channel", status: "running", sessionEpoch: 1, revision: 0, presentationEpoch: 0, currentCellId: board.startCellId, direction: "forward", boardVersionId: "synthetic-board", previewOnly: false },
    boardDefinition: board, inventory: [], missions: [], latestCommand: null,
    pawnAppearance: { revision: 0, image: null },
    layout: { schemaVersion: 1, boardThemeId: "lime-clover", width: 1920, height: 1080, aspectRatio: "16:9", background: "transparent", widgets: [{ id: "board", bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 0 }] },
  };
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/v1/**", route => {
    if (new URL(route.request().url()).pathname !== "/v1/overlay/state") throw new Error("Unexpected API request");
    return route.fulfill({ json: state });
  });
  await page.goto("/overlay#token=synthetic-overlay");
  const surface = page.locator('.marble-board');
  await expect(surface).toHaveAttribute("data-board-theme", "lime-clover");
  await expect(page.locator(".board-cell")).toHaveCount(26);
  await expect(page.locator(".theme-corner")).toHaveCount(4);
  await expect(page.locator(".center-widget")).toHaveCount(0);
  const geometry = await page.locator(".board-stage").boundingBox();
  expect(geometry?.width).toBe(1920);
  expect(geometry?.height).toBe(1080);
  expect(await page.locator(".board-stage").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator(".board-stage").evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  state.layout.boardThemeId = "pink-bunny";
  await expect(surface).toHaveAttribute("data-board-theme", "pink-bunny");
  await expect(page.locator(".token-wrapper")).toHaveAttribute("data-cell-id", board.startCellId);
  await expect(page.locator(".theme-bunny")).toHaveCount(4);
  expect(state.session.revision).toBe(0);
  state.session.revision = 1;
  state.session.currentCellId = "cell-04";
  state.latestCommand = { commandId: "synthetic-roll-one", sessionId: state.session.id, sessionEpoch: 1, presentationEpoch: 0, type: "roll_dice", afterRevision: 1, result: { dice: [3], distance: 3, direction: "forward", fromCellId: "cell-01", toCellId: "cell-04", path: ["cell-02", "cell-03", "cell-04"] } };
  await expect(surface).toHaveAttribute("data-presentation-phase", "reveal", { timeout: 7000 });
  await expect(page.locator(".die")).toHaveCount(1);
  await expect(surface).toHaveAttribute("data-presentation-phase", "idle", { timeout: 10000 });
  await expect(page.locator(".center-widget")).toHaveCount(0);
  await expect(page.locator(".token-wrapper")).toHaveAttribute("data-cell-id", "cell-04");
  state.session.revision = 2;
  state.session.presentationEpoch = 1;
  state.session.currentCellId = "cell-09";
  state.latestCommand = null;
  await expect(page.locator(".token-wrapper")).toHaveAttribute("data-cell-id", "cell-09");
  state.session.revision = 3;
  state.session.currentCellId = "cell-13";
  state.latestCommand = { commandId: "synthetic-island-two", sessionId: state.session.id, sessionEpoch: 1, presentationEpoch: 1, type: "roll_dice", afterRevision: 3, result: { dice: [2, 2], distance: 4, direction: "forward", fromCellId: "cell-09", toCellId: "cell-13", path: ["cell-10", "cell-11", "cell-12", "cell-13"] } };
  await expect(surface).toHaveAttribute("data-presentation-phase", "reveal", { timeout: 7000 });
  await expect(page.locator(".die")).toHaveCount(2);
  await expect(surface).toHaveAttribute("data-presentation-phase", "idle", { timeout: 10000 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(async () => (await page.locator(".board-stage").boundingBox())?.width).toBe(1280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  expect(errors).toEqual([]);
});
