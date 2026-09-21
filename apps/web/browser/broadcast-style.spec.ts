import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const board = JSON.parse(readFileSync(new URL("../../../presets/streamer-board.json", import.meta.url), "utf8"));
const themes = ["lime-clover", "pink-bunny", "sky-soda", "lavender-dream", "midnight-pop", "peach-sorbet"] as const;
const fonts = [
  ["nanum-square-neo", "NanumSquare Neo"],
  ["jua", "Jua"],
  ["do-hyeon", "Do Hyeon"],
  ["black-han-sans", "Black Han Sans"],
] as const;

async function renderedFontForBoardLabel(page: Page, selector = ".marble-board .cell-label") {
  const session = await page.context().newCDPSession(page);
  await session.send("DOM.enable");
  await session.send("CSS.enable");
  const { root } = await session.send("DOM.getDocument", { depth: -1, pierce: true });
  const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector });
  const result = await session.send("CSS.getPlatformFontsForNode", { nodeId });
  await session.detach();
  return result.fonts.filter(font => font.glyphCount > 0);
}

test("published broadcast styles render six themes, four real fonts, and exact menu prices without overflow", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This test verifies the exact 1920×1080 OBS canvas.");
  await page.setViewportSize({ width: 1920, height: 1080 });

  const state: any = {
    channelId: "synthetic-channel",
    session: { id: "synthetic-session", channelId: "synthetic-channel", status: "running", sessionEpoch: 1, revision: 0, presentationEpoch: 0, currentCellId: board.startCellId, direction: "forward", boardVersionId: "synthetic-board", previewOnly: false },
    boardDefinition: board,
    latestCommand: null,
    inventory: [], missions: [], pawnAppearance: { revision: 0, image: null },
    capabilities: { arrivalEffects: true, donations: true },
    layoutVersion: 1,
    layoutUpdatedAt: "2026-09-22T00:00:01.000Z",
    donationMenu: [
      { id: "roll-once", label: "주사위 한 번", amount: 33, rollCount: 1 },
      { id: "snack", label: "안주 먹기", amount: 52 },
      { id: "roll-twice", label: "주사위 두 번", amount: 66, rollCount: 2 },
    ],
    layout: {
      schemaVersion: 1, boardThemeId: themes[0], fontId: fonts[0][0], width: 1920, height: 1080, aspectRatio: "16:9", background: "transparent",
      menu: { source: "rules", title: "오늘의 방송 메뉴", currencyLabel: "별", rows: [] },
      dicePrice: { source: "rules", label: "주사위 딱 한 번", currencyLabel: "별" },
      widgets: [
        { id: "board", bounds: { x: 0, y: 0, width: 1, height: 1 }, z: 1 },
        { id: "menu", bounds: { x: 0.365, y: 0.27, width: 0.27, height: 0.34 }, z: 4 },
        { id: "dice_price", bounds: { x: 0.39, y: 0.63, width: 0.22, height: 0.075 }, z: 4 },
      ],
    },
  };

  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/v1/**", route => {
    if (new URL(route.request().url()).pathname !== "/v1/overlay/state") throw new Error("Unexpected API request");
    return route.fulfill({ json: state });
  });
  await page.goto("/overlay#token=synthetic-overlay");

  const surface = page.locator(".marble-board");
  await expect(surface).toHaveAttribute("data-board-theme", themes[0]);
  await expect(surface).toHaveAttribute("data-board-font", fonts[0][0]);
  await expect(page.locator('[data-broadcast-panel="menu"]')).toContainText("오늘의 방송 메뉴");
  await expect(page.locator('[data-broadcast-panel="menu"]')).toContainText("주사위 한 번");
  await expect(page.locator('[data-broadcast-panel="menu"]')).toContainText("33별");
  await expect(page.locator('[data-broadcast-panel="menu"]')).toContainText("안주 먹기");
  await expect(page.locator('[data-broadcast-panel="dice_price"]')).toContainText("주사위 딱 한 번");
  await expect(page.locator('[data-broadcast-panel="dice_price"]')).toContainText("33별");

  for (const theme of themes) {
    state.layout.boardThemeId = theme;
    state.layoutVersion += 1;
    state.layoutUpdatedAt = `2026-09-22T00:00:${String(state.layoutVersion).padStart(2, "0")}.000Z`;
    await expect(surface).toHaveAttribute("data-board-theme", theme);
    await expect(page.locator('[data-broadcast-panel="menu"]')).toHaveAttribute("data-board-theme", theme);
    await expect(page.locator(".theme-corner")).toHaveCount(4);
    expect(state.session.revision).toBe(0);
    await page.screenshot({path:info.outputPath(`broadcast-${theme}.png`)});
  }

  for (const [fontId, expectedFamily] of fonts) {
    state.layout.fontId = fontId;
    state.layoutVersion += 1;
    state.layoutUpdatedAt = `2026-09-22T00:01:${String(state.layoutVersion).padStart(2, "0")}.000Z`;
    await expect(surface).toHaveAttribute("data-board-font", fontId);
    await expect(page.locator('[data-broadcast-panel="menu"]')).toHaveAttribute("data-board-font", fontId);
    await page.evaluate(() => document.fonts.ready);
    for (const selector of [".marble-board .cell-label", ".broadcast-panel__heading strong", ".broadcast-panel__price-label"])
      await expect.poll(async () => (await renderedFontForBoardLabel(page, selector)).some(font => font.isCustomFont && font.familyName.includes(expectedFamily))).toBe(true);
  }

  state.layout.menu={source:"custom",title:"직접 꾸민 메뉴",currencyLabel:"치즈",rows:[{id:"custom",label:"오늘의 안주",amount:1234}]};
  state.layout.dicePrice={source:"custom",label:"주사위 한번",currencyLabel:"별",amount:567};
  state.layoutVersion+=1;
  await expect(page.locator('[data-broadcast-panel="menu"]')).toContainText("오늘의 안주1,234치즈");
  await expect(page.locator('[data-broadcast-panel="dice_price"]')).toContainText("567별");
  const canvas = page.locator('[data-total-overlay-source="meloming-overlay"] > div').first();
  await expect.poll(async () => canvas.boundingBox()).toMatchObject({ width: 1920, height: 1080 });
  expect(await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }))).toEqual({ width: 1920, height: 1080 });
  for (const panel of await page.locator(".broadcast-panel").all()) {
    expect(await panel.evaluate(element => ({ x: element.scrollWidth <= element.clientWidth, y: element.scrollHeight <= element.clientHeight }))).toEqual({ x: true, y: true });
  }
  expect(errors).toEqual([]);
});
