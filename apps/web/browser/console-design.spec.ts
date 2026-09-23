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
    if (path.endsWith("/feed/events")) {
      await route.fulfill({ status: 204 });
      return;
    }
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
    else if (path.endsWith("/overlay-token")) response = {id:"test-overlay",token:"synthetic-overlay",tokenSuffix:"rlay",createdAt:"2026-09-23T00:00:00Z",lastUsedAt:null,overlayUrlPath:"/overlay#token=synthetic-overlay"};
    else if (path.endsWith("/overlay-layout/live")) response = {canEdit:true,layoutVersion:0,layoutUpdatedAt:null,layout:{schemaVersion:1,width:1920,height:1080,aspectRatio:"16:9",background:"transparent",widgets:[{id:"board",bounds:{x:0,y:0,width:1,height:1},z:1}]}};
    else if (path.endsWith("/donations"))
      response = {
        items: [{
          id: "test-donation",
          donorDisplayName: "테스트 후원자",
          amount: 33,
          result: "matched",
          occurredAt: "2026-01-01T00:00:00Z",
          message: "테스트 후원",
        }],
        nextCursor: null,
        collectionConnected: true,
      };
    else if (path.endsWith("/chats"))
      response = {
        items: [{ id: "test-chat", userId: "viewer-1", userDisplayName: "테스트 시청자",
          message: "안녕하세요", occurredAt: "2026-01-01T00:00:01Z",
          receivedAt: "2026-01-01T00:00:02Z", gapBefore: false, matchedTaskId: null }],
        nextCursor: null, collectionConnected: true,
      };
    else if (path.endsWith("/operations"))
      response = {
        items: [{
          id: "test-operation",
          operation_type: "set_position",
          source_kind: "operator",
          createdAt: "2026-01-01T00:00:00Z",
          before_state: { position: 1 },
          after_state: { position: 2 },
        }],
        nextCursor: null,
      };
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
  // The inherited header starts the console; no product banner may precede it.
  await expect
    .poll(async () => (await page.locator("header").boundingBox())?.y)
    .toBe(0);
  const headerLinks = page.locator("header");
  const collectorLink = headerLinks.getByRole("link", { name: "개발자도구", exact: true });
  const accountLink = headerLinks.getByRole("link", { name: "계정 관리", exact: true });
  await expect(collectorLink).toHaveAttribute("href", "/collector");
  expect(await collectorLink.getAttribute("class")).toBe(await accountLink.getAttribute("class"));
  expect(await headerLinks.locator('a[href="/collector"], a[href="/account"]').allTextContents())
    .toEqual(["개발자도구", "계정 관리"]);
  await expect(page.locator("footer").getByRole("link", { name: "개발자도구" })).toHaveCount(0);
  const homeTab = nav.getByRole("tab", { name: "홈", exact: true });
  await expect(homeTab).toHaveAttribute("data-console-tab", "home");
  await expect(homeTab).not.toHaveAttribute("data-slot", "tabs-trigger");
  await expect(homeTab.locator(".absolute.bottom-0")).toBeVisible();
  expect(
    await homeTab.evaluate((element) => getComputedStyle(element).borderRadius),
  ).toBe("0px");
  await expect(nav.getByRole("tab", { name: "후원 내역" })).toHaveCount(0);
  await expect(nav.getByRole("tab", { name: "운영 기록" })).toHaveCount(0);
  const donations = page.locator("#console-panel-home").getByRole("region", { name: "실시간 채팅과 후원 내역" });
  await expect(donations).toBeVisible();
  const feedHeader = donations.locator(":scope > div").first();
  await expect.poll(async () => (await feedHeader.boundingBox())?.height).toBe(53);
  const feedTabsBox = await donations.getByRole("tablist").boundingBox();
  const searchButton = donations.getByRole("button", { name: "내역 검색 및 필터" });
  const searchButtonBox = await searchButton.boundingBox();
  expect(feedTabsBox && searchButtonBox && searchButtonBox.x >= feedTabsBox.x + feedTabsBox.width).toBe(true);
  const quickSearch = donations.getByRole("textbox", { name: "빠른 후원자 검색" });
  if (test.info().project.name === "desktop") await expect(quickSearch).toBeVisible();
  else await expect(quickSearch).toBeHidden();
  await expect(donations.getByText("테스트 후원자")).toBeVisible();
  await donations.getByRole("tab", { name: "채팅 내역" }).click();
  await expect(donations.getByText("테스트 시청자")).toBeVisible();
  await expect(donations.getByText("안녕하세요")).toBeVisible();
  await donations.getByRole("tab", { name: "후원 내역" }).click();
  await nav.getByRole("tab", { name: "홈", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(nav.getByRole("tab", { name: "게임 규칙" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(nav.getByRole("tab", { name: "게임 규칙" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await homeTab.click();
  await searchButton.click();
  const filter = page.getByRole("combobox", { name: "처리 결과" });
  await filter.click();
  await page.getByRole("option", { name: "규칙 일치", exact: true }).click();
  await expect(filter).toContainText("규칙 일치");
  await filter.click();
  await page.getByRole("option", { name: "전체 결과", exact: true }).click();
  await expect(filter).toContainText("전체 결과");
  await page.getByRole("button", { name: "조회" }).click();
  await expect(filter).not.toBeVisible();
  for (const name of ["오버레이 설정", "홈"]) {
    await nav.getByRole("tab", { name, exact: true }).click();
    await expect(collectorLink).toBeInViewport();
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

test("developer tools includes the operation history from the former console tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "개발자도구", exact: true }).click();
  await expect(page).toHaveURL(/\/collector$/);
  await expect(page.getByRole("heading", { name: "개발자도구" })).toBeVisible();
  await expect(page.getByText("방송·수집 상태와 운영 기록을 확인하세요.")).toBeVisible();
  await expect(page.getByText("운영 기록", { exact: true })).toBeVisible();
  await expect(page.getByText("위치 보정", { exact: true })).toBeVisible();
  await page.getByText("변경 전·후 상세").click();
  await expect(page.getByText(/"position": 1/)).toBeVisible();
  await expect(page.getByText(/"position": 2/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("configuration remains mounted when leaving its top-level tab", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("tablist", { name: "운영 콘솔 메뉴" });
  await nav.getByRole("tab", { name: "게임 규칙" }).click();
  await expect(
    page.getByRole("heading", { name: "게임 규칙", exact: true }),
  ).toBeVisible();
  // Tag the mounted workspace DOM to detect a remount, without relying on editor-specific field names.
  const workspace = page.getByRole("heading", {
    name: "게임 규칙",
    exact: true,
  });
  await workspace.evaluate((element) =>
    element.setAttribute("data-mount-test", "preserved"),
  );
  await nav.getByRole("tab", { name: "홈", exact: true }).click();
  await nav.getByRole("tab", { name: "게임 규칙" }).click();
  await expect(workspace).toHaveAttribute("data-mount-test", "preserved");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
