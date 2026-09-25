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
        counters: [{ counterId: "cups", label: "커피", unit: "잔", value: 5, reserved: 0, available: 5, revision: 1 }],
        effectTasks: [{
          id: "travel-task", type: "choose_destination", status: "pending", revision: 1,
          payload: { allowedCellIds: [board.path[1], board.path[2]], selection: "operator" },
        }, {
          id: "selected-travel-task", type: "choose_destination", status: "pending", revision: 2,
          payload: { selectedCellId: board.path[3], selection: "operator" },
        }, {
          id: "donor-travel-task", type: "donation_destination", status: "pending", revision: 1,
          payload: { selectedCellId: null, selection: "donor_chat" },
        }],
        movementLock: { releaseType: "skip_rolls", rollsRemaining: 2, release: { type: "skip_rolls", count: 3 }, createdAt: "2026-01-01T00:00:00Z" },
        missions: [{ id: "mission-1", message: "일회성 미션", quantity: 1, status: "pending",
          revision: 0, shield: null, createdAt: "2026-01-01T00:00:00Z", durationSeconds: null }],
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
    else if (path.endsWith("/history"))
      response = { items: [
        { commandId: "history-2", type: "roll_dice", source: "operator", reason: "방송 운영 조작",
          result: { dice: [2, 3], toCellId: board.path[2], effects: [{
            type: "mission", cellId: board.path[2], result: { message: "지난 칸의 미션" },
          }] }, afterRevision: 1, createdAt: "2026-01-01T00:01:00Z" },
        { commandId: "history-1", type: "create_session", source: "operator", reason: "create session",
          result: {}, afterRevision: 0, createdAt: "2026-01-01T00:00:00Z" },
      ], nextCursor: null };
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

test("a board cell opens the position action and sends the selected cell", async ({ page }) => {
  let submitted: { type: string; payload: { cellId: string; pauseAutomaticMovement: boolean; triggerArrivalEffects: boolean } } | null = null;
  await page.route("**/v1/channels/**/sessions/**/commands", async (route) => {
    const command = route.request().postDataJSON();
    submitted = command;
    await route.fulfill({ json: {
      commandId: command.commandId, sessionId: session.id, sessionEpoch: session.sessionEpoch,
      presentationEpoch: session.presentationEpoch + 1, type: command.type, status: "completed",
      operatorId: "test-operator", beforeRevision: 1, afterRevision: 2,
      result: { fromCellId: board.path[0], toCellId: command.payload.cellId, automaticMovementPaused: true },
      rejectionCode: null, createdAt: "2026-01-01T00:00:00Z",
    } });
  });
  await page.goto("/");
  const boardCells = page.locator("#console-panel-home .board-cell");
  const move = page.getByRole("button", { name: "이 칸으로 이동" });
  await expect(move).toHaveCount(0);
  await boardCells.nth(2).click();
  await expect(move).toBeVisible();
  await expect(move).toHaveText("이 칸으로 이동");
  const thirdCell = await boardCells.nth(2).boundingBox();
  const thirdAction = await move.boundingBox();
  expect(thirdCell && thirdAction && thirdAction.x < thirdCell.x + thirdCell.width && thirdAction.x + thirdAction.width > thirdCell.x).toBe(true);
  expect(thirdAction && thirdAction.width >= 100 && thirdAction.height >= 32).toBe(true);
  expect(thirdCell && thirdAction && thirdAction.y >= thirdCell.y + thirdCell.height).toBe(true);
  for (const index of board.cells.map((_: unknown, index: number) => index).slice(1)) {
    await boardCells.nth(index).click();
    await expect(move).toBeVisible();
    expect(await move.evaluate((button) => {
      const action = button.getBoundingClientRect();
      return [...document.querySelectorAll("#console-panel-home .board-cell")].every((cell) => {
        const rect = cell.getBoundingClientRect();
        return action.right <= rect.left || action.left >= rect.right ||
          action.bottom <= rect.top || action.top >= rect.bottom;
      });
    })).toBe(true);
  }
  await boardCells.nth(1).click();
  const secondCell = await boardCells.nth(1).boundingBox();
  const secondAction = await move.boundingBox();
  expect(secondCell && secondAction && secondAction.x < secondCell.x + secondCell.width && secondAction.x + secondAction.width > secondCell.x).toBe(true);
  await boardCells.nth(1).click({ position: { x: 5, y: 5 } });
  await expect(move).toHaveCount(0);
  await boardCells.nth(1).click();
  await page.keyboard.press("Escape");
  await expect(move).toHaveCount(0);
  await boardCells.nth(1).click();
  await page.getByText("게임 보드", { exact: true }).click();
  await expect(move).toHaveCount(0);
  await boardCells.nth(1).click();
  await expect(page.getByRole("checkbox", { name: "도착 칸 효과도 실행" })).toHaveCount(0);
  await move.click();
  await expect.poll(() => submitted).toMatchObject({
    type: "set_position",
    payload: { cellId: board.path[1], pauseAutomaticMovement: true, triggerArrivalEffects: true },
  });
  await expect(move).toHaveCount(0);
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
    await page.getByRole("tablist", { name: "개발자도구 메뉴" })
      .getByRole("tab", { name: "방송 테스트" }).click();
    expect(await buttonStyle(page, "방송 조회")).toEqual(consoleStyle);
  }
});

test("access token management calls removal 삭제 throughout the account screen", async ({ page }) => {
  await page.route("**/v1/auth/tokens", async (route) => {
    await route.fulfill({ json: [
      { id: "active-token", label: "방송용", expiresAt: "2026-12-01T00:00:00Z", lastUsedAt: null, revokedAt: null },
      { id: "deleted-token", label: "이전 토큰", expiresAt: "2026-12-01T00:00:00Z", lastUsedAt: null, revokedAt: "2026-09-01T00:00:00Z" },
    ] });
  });
  await page.goto("/account");
  await expect(page.getByText("테스트 운영자 계정의 토큰을 발급하고 삭제합니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "삭제", exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "삭제", exact: true }).last()).toBeDisabled();
  await expect(page.getByText("삭제됨")).toBeVisible();
  await expect(page.getByText("회수", { exact: true })).toHaveCount(0);
});

test("deleting the current access token reports success after its session ends", async ({ page }) => {
  let deleted = false;
  await page.route("**/v1/auth/session", async (route) => {
    await route.fulfill(deleted
      ? { status: 401, json: { message: "Unauthorized" } }
      : { json: { csrfToken: "test-csrf", operator: { id: "test-operator", username: "테스트 운영자" } } });
  });
  await page.route("**/v1/auth/tokens", async (route) => {
    await route.fulfill(deleted
      ? { status: 401, json: { message: "Unauthorized" } }
      : { json: [{ id: "current-token", label: "현재 로그인 토큰", expiresAt: "2026-12-01T00:00:00Z", lastUsedAt: null, revokedAt: null }] });
  });
  await page.route("**/v1/auth/tokens/current-token", async (route) => {
    deleted = true;
    await route.fulfill({ status: 204 });
  });
  await page.goto("/account");
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByText("접근 토큰을 삭제했습니다. 연결된 로그인 세션도 종료됩니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByText("토큰을 삭제하지 못했습니다.")).toHaveCount(0);
});

test("original animated top tabs, new Shadcn controls, empty option, checkbox and responsive page", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "이 칸으로 이동" })).toHaveCount(0);
  await page.locator("#console-panel-home .board-cell").nth(1).click();
  await expect(page.getByRole("button", { name: "이 칸으로 이동" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "이 칸으로 이동" })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("developer tools includes the operation history from the former console tab", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "개발자도구", exact: true }).click();
  await expect(page).toHaveURL(/\/collector$/);
  await expect(page.getByRole("heading", { name: "개발자도구" })).toBeVisible();
  await expect(page.getByText("방송·수집 상태와 운영 기록을 확인하세요.")).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "개발자도구 메뉴" });
  const statusTab = tabs.getByRole("tab", { name: "수집 현황" });
  const testsTab = tabs.getByRole("tab", { name: "방송 테스트" });
  const operationsTab = tabs.getByRole("tab", { name: "운영 기록" });
  await expect(statusTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "수집 현황" })
    .getByText("주루마블 수신 현황")).toBeVisible();
  await expect(page.getByRole("button", { name: "방송 조회" })).toBeHidden();
  await testsTab.click();
  await expect(page.getByRole("heading", { name: "방송 조회 테스트" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "입장·채팅 수집 테스트" })).toBeVisible();
  await operationsTab.click();
  await expect(page.getByRole("heading", { name: "방송 조회 테스트" })).toBeHidden();
  await expect(page.getByText("위치 보정", { exact: true })).toBeVisible();
  await page.getByText("변경 전·후 상세").click();
  await expect(page.getByText(/"position": 1/)).toBeVisible();
  await expect(page.getByText(/"position": 2/)).toBeVisible();
  await statusTab.click();
  await expect(page.getByText("상세 진단 정보")).toBeVisible();
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

test("home separates current actions from three tabs that own all remaining controls", async ({ page }) => {
  const submitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  await page.route("**/v1/channels/**/sessions/**/commands", async (route) => {
    const command = route.request().postDataJSON();
    submitted.push(command);
    await route.fulfill({ json: {
      commandId: command.commandId, sessionId: session.id, sessionEpoch: session.sessionEpoch,
      presentationEpoch: session.presentationEpoch, type: command.type, status: "completed",
      operatorId: "test-operator", beforeRevision: 1, afterRevision: 2, result: {},
      rejectionCode: null, createdAt: "2026-01-01T00:02:00Z",
    } });
  });
  await page.goto("/");
  const actions = page.getByRole("region", { name: "현재 할 수 있는 액션" });
  await expect(actions.getByRole("heading", { name: "현재 할 수 있는 액션" })).toBeVisible();
  await expect(actions.getByText("세계여행 목적지")).toHaveCount(1);
  await expect(actions.getByText("후원 목적지")).toHaveCount(0);
  await expect(actions.getByText("선택됨", { exact: false })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "게임 재개" })).toHaveCount(0);
  await expect(actions.getByText("일회성 미션")).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "완료", exact: true })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "면제", exact: true })).toHaveCount(0);
  await actions.getByRole("group", { name: "이동할 칸 선택" }).getByRole("button").first().click();
  await actions.getByRole("button", { name: "목적지 저장" }).click();
  await expect.poll(() => submitted.at(-1)).toMatchObject({
    type: "choose_destination", payload: { taskId: "travel-task", cellId: board.path[1] },
  });
  await actions.getByRole("button", { name: "3회 남김" }).click();
  await expect.poll(() => submitted.at(-1)).toMatchObject({
    type: "set_movement_lock_remaining", payload: { rollsRemaining: 3 },
  });
  const details = page.getByRole("region", { name: "게임 관리 탭" });
  await expect(details.getByRole("tab", { name: "적립/보상" })).toHaveAttribute("aria-selected", "true");
  await expect(details.getByText("사용 가능 2개")).toBeVisible();
  await expect(details.getByText("총 5 잔")).toBeVisible();
  await expect(details.getByRole("textbox", { name: "수량 조정 사유" })).toHaveCount(0);
  await details.getByRole("tab", { name: "게임 조작" }).click();
  const operations = details.getByRole("tabpanel", { name: "게임 조작" });
  await expect(operations.getByRole("button", { name: "게임 재개" })).toBeVisible();
  const effects = operations.getByRole("region", { name: "적용 중인 판 효과" });
  await expect(effects.getByText("세계여행 목적지")).toBeVisible();
  await expect(effects.getByText("후원 목적지")).toBeVisible();
  await expect(effects.getByRole("button", { name: "목적지 변경" })).toBeVisible();
  await expect(operations.getByRole("textbox", { name: "작업 사유" })).toHaveCount(0);
  await expect(operations.getByRole("region", { name: "수동 미션" })).toHaveCount(0);
  await expect(operations.getByRole("button", { name: "세션 종료" })).toBeVisible();
  await details.getByRole("tab", { name: "게임 기록" }).click();
  await expect(details.getByText("게임 시작")).toBeVisible();
  await expect(details.getByText("주사위 2 + 3")).toBeVisible();
  await expect(details.getByText("지난 칸의 미션", { exact: false })).toBeVisible();
  await expect(actions.getByText("지난 칸의 미션")).toHaveCount(0);
  await details.getByRole("tab", { name: "게임 조작" }).click();
  const layout = await actions.evaluate((element) => {
    const tabs = document.querySelector('[aria-label="게임 관리 탭"]')!;
    const actionRect = element.getBoundingClientRect();
    const tabsRect = tabs.getBoundingClientRect();
    return {
      actionWidth: actionRect.width,
      tabsWidth: tabsRect.width,
      parentWidth: tabs.parentElement!.getBoundingClientRect().width,
      gap: tabsRect.top - element.parentElement!.getBoundingClientRect().bottom,
      actionBackground: getComputedStyle(element).backgroundColor,
      actionTopBorder: parseFloat(getComputedStyle(element).borderTopWidth),
      tabsBackground: getComputedStyle(tabs).backgroundColor,
      tabsOwnRemainingArea: tabs.parentElement!.lastElementChild === tabs,
    };
  });
  expect(Math.abs(layout.actionWidth - layout.parentWidth)).toBeLessThan(2);
  expect(Math.abs(layout.tabsWidth - layout.parentWidth)).toBeLessThan(2);
  expect(layout.gap).toBeGreaterThanOrEqual(12);
  expect(layout.actionBackground).not.toBe(layout.tabsBackground);
  expect(layout.actionTopBorder).toBeLessThanOrEqual(1);
  expect(layout.tabsOwnRemainingArea).toBe(true);
});

test("the last game remains available in history after it ends", async ({ page }) => {
  let requestedHistory = "";
  await page.route("**/v1/channels/**/operator-state", async (route) => {
    await route.fulfill({ json: {
      session: null, boardDefinition: null,
      lastEndedSession: { id: "ended-session", boardDefinition: board },
      inventory: [], missions: [], pawnAppearance: { revision: 0, image: null },
      capabilities: { sessionLifecycle: true },
    } });
  });
  await page.route("**/v1/channels/**/sessions/**/history", async (route) => {
    requestedHistory = new URL(route.request().url()).pathname;
    await route.fulfill({ json: { items: [{
      commandId: "ended-history", type: "create_session", source: "operator",
      reason: "create session", result: {}, afterRevision: 0,
      createdAt: "2026-01-01T00:00:00Z",
    }], nextCursor: null } });
  });
  await page.goto("/");
  const details = page.getByRole("region", { name: "게임 관리 탭" });
  await details.getByRole("tab", { name: "게임 기록" }).click();
  await expect(details.getByText("게임 시작")).toBeVisible();
  expect(requestedHistory).toContain("/sessions/ended-session/history");
});
