import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const board = JSON.parse(
  readFileSync(
    new URL("../../../presets/streamer-board.json", import.meta.url),
    "utf8",
  ),
);
const rules = JSON.parse(
  readFileSync(
    new URL("../../../presets/streamer-initial.json", import.meta.url),
    "utf8",
  ),
);
const items = [{ id: "shield", label: "테스트 실드", maxQuantity: 100 }];
const session = {
  id: "test-session",
  channelId: "test-channel",
  status: "paused",
  sessionEpoch: 1,
  presentationEpoch: 1,
  previewOnly: false,
  revision: 1,
  boardVersionId: "test-board",
  currentCellId: board.path[0],
  direction: "forward",
};

async function mockApi(page: Page) {
  // Everything is synthetic and intercepted in-browser; never connect to a collector or real game.
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let response: unknown = {};
    if (path.endsWith("/auth/config"))
      response = { mode: "token", localLoginEnabled: false };
    else if (path.endsWith("/auth/session"))
      response = {
        csrfToken: "test-csrf",
        operator: { id: "test-operator", username: "테스트 운영자" },
      };
    else if (path.endsWith("/auth/tokens")) response = [];
    else if (path.endsWith("/operator-state"))
      response = {
        session,
        boardDefinition: board,
        inventory: [
          {
            itemId: "shield",
            name: "테스트 실드",
            quantity: 2,
            revision: 1,
            updatedAt: "2026-01-01T00:00:00Z",
          },
        ],
        missions: [],
        pawnAppearance: { revision: 0, image: null },
        capabilities: {
          manualRoll: true,
          setDirection: true,
          setPosition: true,
          arrivalEffects: true,
          donations: true,
          inventory: true,
          missions: true,
          sessionLifecycle: true,
        },
      };
    else if (path.endsWith("/collector"))
      response = { enabled: false, transport: "disconnected", counts: {} };
    else if (path.includes("/board-versions/runnable")) response = [];
    else if (path.endsWith("/obs-tokens")) response = [];
    else if (path.endsWith("/donations"))
      response = { items: [], nextCursor: null, collectionConnected: true };
    else if (path.endsWith("/operations"))
      response = { items: [], nextCursor: null };
    else if (path.includes("/config/")) {
      const kind = path.split("/").at(-1)!;
      const document =
        kind === "board"
          ? board
          : kind === "rules"
            ? rules
            : kind === "items"
              ? items
              : {
                  schemaVersion: 1,
                  width: 1920,
                  height: 1080,
                  aspectRatio: "16:9",
                  background: "transparent",
                  widgets: [],
                };
      response = {
        draft: null,
        published: {
          id: `test-${kind}`,
          kind,
          revision: 1,
          status: "published",
          document,
          validationErrors: [],
        },
        effectiveDocument: document,
      };
    } else
      throw new Error(
        `Unexpected test API request: ${route.request().method()} ${path}`,
      );
    await route.fulfill({ json: response });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

async function buttonStyle(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeVisible();
  return button.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      background: css.backgroundColor,
      color: css.color,
      radius: css.borderRadius,
      weight: css.fontWeight,
      height: css.height,
    };
  });
}

test("default buttons share one visual contract across console, login and account in both themes", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "한 건 진행", exact: true }),
    ).toBeEnabled();
    const consoleStyle = await buttonStyle(page, "한 건 진행");
    await page.goto("/login");
    expect(await buttonStyle(page, "토큰으로 로그인")).toEqual(consoleStyle);
    await page.goto("/account");
    expect(await buttonStyle(page, "새 토큰 발급")).toEqual(consoleStyle);
    await page.goto("/collector");
    expect(await buttonStyle(page, "방송 조회")).toEqual(consoleStyle);
  }
});

test("original animated top tabs, new Shadcn controls, empty option, checkbox and responsive page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  const arrival = page.getByRole("checkbox", { name: "도착 칸 효과도 실행" });
  await arrival.check();
  await expect(arrival).toBeChecked();
  const nav = page.getByRole("tablist", { name: "운영 콘솔 메뉴" });
  const homeTab = nav.getByRole("tab", { name: "홈", exact: true });
  await expect(homeTab).toHaveAttribute("data-console-tab", "home");
  await expect(homeTab).not.toHaveAttribute("data-slot", "tabs-trigger");
  await expect(homeTab.locator(".absolute.bottom-0")).toBeVisible();
  expect(
    await homeTab.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("0px");
  await nav.getByRole("tab", { name: "홈", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(nav.getByRole("tab", { name: "후원 내역" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(nav.getByRole("tab", { name: "후원 내역" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const filter = page.getByRole("combobox", { name: "처리 결과" });
  await filter.click();
  await page.getByRole("option", { name: "규칙 일치", exact: true }).click();
  await expect(filter).toContainText("규칙 일치");
  await filter.click();
  await page.getByRole("option", { name: "전체 결과", exact: true }).click();
  await expect(filter).toContainText("전체 결과");
  for (const name of ["OBS 설정", "운영 기록", "홈"]) {
    await nav.getByRole("tab", { name, exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <= innerWidth &&
              document.documentElement.scrollHeight <= innerHeight,
          ),
        { message: `No page overflow on ${name}` },
      )
      .toBe(true);
  }
  await expect(arrival).toBeChecked(); // home controller was never remounted
  expect(errors).toEqual([]);
});

test("configuration remains mounted when leaving its top-level tab", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("tablist", { name: "운영 콘솔 메뉴" });
  await nav.getByRole("tab", { name: "규칙·보드" }).click();
  await expect(
    page.getByRole("heading", { name: "규칙·보드", exact: true }),
  ).toBeVisible();
  // Tag the mounted workspace DOM to detect a remount, without relying on editor-specific field names.
  const workspace = page.getByRole("heading", {
    name: "규칙·보드",
    exact: true,
  });
  await workspace.evaluate((element) =>
    element.setAttribute("data-mount-test", "preserved"),
  );
  await nav.getByRole("tab", { name: "후원 내역" }).click();
  await nav.getByRole("tab", { name: "규칙·보드" }).click();
  await expect(workspace).toHaveAttribute("data-mount-test", "preserved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
