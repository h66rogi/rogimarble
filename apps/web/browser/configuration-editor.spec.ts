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

async function fixture(
  page: Page,
  options: { conflict?: boolean; loadError?: boolean; legacyTheme?: boolean } = {},
) {
  const writes: { kind: string; verb: string; body: any }[] = [];
  let pawnAppearance = { revision: 0, styleId: "star-medal", image: null };
  const documents: Record<string, any> = {
    board: structuredClone(board),
    rules: structuredClone(rules),
    items: structuredClone(rules.items),
    "overlay-layout": {
      schemaVersion: 1,
      width: 1920,
      height: 1080,
      aspectRatio: "16:9",
      background: "transparent",
      widgets: [],
    },
  };
  if (options.legacyTheme) documents["overlay-layout"].boardThemeId = "classic-party";
  const drafts: Record<string, any> = options.legacyTheme ? {
    "overlay-layout": { id: "fixture-legacy-layout", kind: "overlay-layout", revision: 1, status: "validated", document: structuredClone(documents["overlay-layout"]), validationErrors: [] },
  } : {};
  const published = (kind: string) => ({
    id: `fixture-published-${kind}`,
    kind,
    revision: 1,
    status: "published",
    document: documents[kind],
    validationErrors: [],
  });
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/feed/events")) return route.fulfill({ status: 204 });
    let data: unknown = {};
    if (path.includes("/config/")) {
      const [, rest] = path.split("/config/");
      const [kind, , action] = rest.split("/");
      if (request.method() === "GET") {
        if (options.loadError && kind === "board")
          return route.fulfill({
            status: 503,
            json: { message: "테스트: 설정을 불러오지 못했어요." },
          });
        data = {
          draft: drafts[kind] ?? null,
          published: published(kind),
          effectiveDocument: documents[kind],
        };
      } else {
        const body = request.postDataJSON();
        writes.push({ kind, verb: action ?? request.method(), body });
        if (options.conflict)
          return route.fulfill({
            status: 409,
            json: { message: "Configuration revision changed" },
          });
        if (action) {
          expect(body.expectedRevision).toBe(drafts[kind].revision);
          drafts[kind] = {
            ...drafts[kind],
            revision: drafts[kind].revision + 1,
            status: action === "validate" ? "validated" : "published",
          };
        } else {
          if (drafts[kind])
            expect(body.expectedRevision).toBe(drafts[kind].revision);
          drafts[kind] = {
            id: `fixture-draft-${kind}`,
            kind,
            revision: (drafts[kind]?.revision ?? 0) + 1,
            status: "draft",
            document: body.document,
            validationErrors: [],
          };
        }
        data = drafts[kind];
      }
    } else if (path.endsWith("/auth/session"))
      data = {
        csrfToken: "synthetic-csrf",
        operator: { id: "synthetic-operator", username: "테스트 운영자" },
      };
    else if (path.endsWith("/auth/config"))
      data = { mode: "token", localLoginEnabled: false };
    else if (path.endsWith("/operator-state"))
      data = {
        session: null,
        boardDefinition: board,
        inventory: [],
        missions: [],
        pawnAppearance,
        capabilities: {},
      };
    else if (path.endsWith("/pawn-style")) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        expect(body.expectedRevision).toBe(pawnAppearance.revision);
        pawnAppearance = { ...pawnAppearance, revision: pawnAppearance.revision + 1, styleId: body.styleId };
      }
      data = pawnAppearance;
    }
    else if (path.endsWith("/pawn-image")) data = pawnAppearance;
    else if (path.endsWith("/collector"))
      data = { enabled: false, transport: "disconnected", counts: {} };
    else if (path.endsWith("/donations"))
      data = { items: [], nextCursor: null, collectionConnected: false };
    else if (path.endsWith("/chats"))
      data = { items: [], nextCursor: null, collectionConnected: false };
    else if (path.endsWith("/operations"))
      data = { items: [], nextCursor: null };
    else if (
      path.includes("/board-versions/") ||
      path.endsWith("/auth/tokens")
    )
      data = [];
    else if (path.endsWith("/overlay-token"))
      data = { id: "test-overlay", token: "synthetic-overlay", tokenSuffix: "rlay", createdAt: "2026-09-23T00:00:00Z", lastUsedAt: null, overlayUrlPath: "/overlay#token=synthetic-overlay" };
    else throw new Error(`Unexpected API ${request.method()} ${path}`);
    await route.fulfill({ json: data });
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "보드 설정", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "보드 설정", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  return { writes, documents, errors };
}
const config = (page: Page) =>
  page.getByRole("region", { name: "게임판 설정", exact: true });
async function selectCell(page: Page, number: number) {
  await config(page)
    .locator(`[data-cell-id="${board.path[number - 1]}"]`)
    .click();
}

test("board editing keeps identities, actions and unsaved values across both levels of tabs; publishing uses the validated revision", async ({
  page,
}) => {
  const state = await fixture(page);
  await expect(config(page).getByRole("note")).toContainText("새 게임을 시작할 때 선택");
  const saveBar = config(page).getByTestId("configuration-save-bar");
  await expect(saveBar).toHaveAttribute("data-state", "saved");
  await expect(saveBar).toHaveAttribute("data-variant", "floating");
  const savedAppearance = await saveBar.evaluate((element) => {
    const style = getComputedStyle(element);
    return { position: style.position, bottom: style.bottom, background: style.backgroundColor, blur: style.backdropFilter };
  });
  expect(savedAppearance.position).toBe("sticky");
  expect(savedAppearance.bottom).toBe("16px");
  expect(savedAppearance.blur).toContain("blur(");
  await expect(saveBar).toHaveClass(/shadow-none/);
  const frostedBackdrop = saveBar.locator('[data-slot="card-frosted-backdrop"]');
  await expect(frostedBackdrop).toHaveCount(1);
  expect(await frostedBackdrop.evaluate((element) => getComputedStyle(element).backdropFilter)).toContain("blur(");
  const saveBarBox = await saveBar.boundingBox();
  const panelBox = await page.locator("#console-panel-configuration").boundingBox();
  expect(saveBarBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(saveBarBox!.x).toBeGreaterThan(panelBox!.x + 24);
  expect(saveBarBox!.width).toBeLessThan(panelBox!.width - 48);
  const backdropBox = await frostedBackdrop.boundingBox();
  expect(backdropBox).not.toBeNull();
  expect(backdropBox!.x).toBeLessThan(saveBarBox!.x - 16);
  await selectCell(page, 2);
  await config(page)
    .getByLabel("칸 이름", { exact: true })
    .fill("방향전환이라는 이름의 미션");
  await expect(saveBar).toHaveAttribute("data-state", "dirty");
  await expect(saveBar).toHaveAttribute("data-variant", "floating-warning");
  await expect(saveBar.getByRole("status")).toHaveText("변경사항을 저장해 주세요");
  expect(await saveBar.getByRole("status").evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(32);
  await expect(saveBar).toContainText("적용 시점 · 새 게임을 시작할 때 선택");
  expect(await saveBar.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(savedAppearance.background);
  await page.getByRole("tablist", { name: "운영 콘솔 메뉴" }).getByRole("tab", { name: "게임 규칙" }).click();
  await expect(page.getByRole("region", { name: "후원 규칙 설정" })).toBeVisible();
  await expect(page.getByRole("region", { name: "후원 규칙 설정" }).getByRole("note")).toContainText("새로 수락하는 후원부터 적용");
  await page.getByRole("tablist", { name: "운영 콘솔 메뉴" }).getByRole("tab", { name: "보드 설정" }).click();
  await expect(config(page).getByLabel("칸 이름", { exact: true })).toHaveValue(
    "방향전환이라는 이름의 미션",
  );
  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await page.getByRole("tab", { name: "보드 설정", exact: true }).click();
  await expect(config(page).getByLabel("칸 이름", { exact: true })).toHaveValue(
    "방향전환이라는 이름의 미션",
  );
  await config(page)
    .getByRole("button", { name: "검사하고 게시", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.writes.map((w) => w.verb)).toEqual(["POST", "validate"]);
  const saved = state.writes[0].body.document;
  expect(saved.path).toEqual(board.path);
  expect(saved.cells[1].id).toBe(board.cells[1].id);
  expect(saved.cells[1].onLand).toEqual(board.cells[1].onLand);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "게시하기", exact: true })
    .click();
  await expect(
    config(page).getByRole("button", { name: "게시됨", exact: true }),
  ).toBeDisabled();
  expect(state.writes.at(-1)?.body.expectedRevision).toBe(2);
  expect(state.errors).toEqual([]);
});

test("game rules and board settings group their own menus and move pawn design out of home", async ({ page }) => {
  const state = await fixture(page);
  const top = page.getByRole("tablist", { name: "운영 콘솔 메뉴" });
  await expect(top.getByRole("tab", { name: "규칙·보드" })).toHaveCount(0);
  const boardTabs = page.getByRole("tablist", { name: "보드 설정 세부 메뉴" });
  const boardTab = boardTabs.getByRole("tab", { name: "게임판" });
  const themeTab = boardTabs.getByRole("tab", { name: "방송 테마·배치" });
  await expect(boardTab).toHaveAttribute("data-slot", "button");
  await expect(boardTab).toHaveClass(/rounded-full/);
  await expect(themeTab).toHaveClass(/rounded-full/);
  await expect(boardTab).toHaveAttribute("aria-selected", "true");
  expect(await boardTab.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(await themeTab.evaluate((element) => getComputedStyle(element).backgroundColor));
  await boardTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(themeTab).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(boardTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "방송 테마·배치" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "말 디자인" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "아이템" })).toHaveCount(0);

  await top.getByRole("tab", { name: "게임 규칙" }).click();
  await expect(page.getByRole("tab", { name: "후원 규칙" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "아이템" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "방송 테마·배치" })).toHaveCount(0);
  await page.getByRole("tab", { name: "아이템" }).click();
  await expect(page.getByRole("region", { name: "아이템 설정" })).toBeVisible();

  await top.getByRole("tab", { name: "보드 설정" }).click();
  await page.getByRole("tab", { name: "말 디자인" }).click();
  const pawn = page.getByRole("region", { name: "말 디자인 설정" });
  await expect(pawn.getByText("말 디자인", { exact: true })).toBeVisible();
  await pawn.getByRole("button", { name: /하트 칩/ }).click();
  await expect(pawn.getByText("2번 하트 칩 말을 적용했습니다.")).toBeVisible();
  await top.getByRole("tab", { name: "홈" }).click();
  await expect(page.locator("#console-panel-home").getByText("말 디자인", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "이 칸으로 이동" })).toHaveCount(0);
  await page.locator("#console-panel-home .board-cell").nth(1).click();
  await expect(page.getByRole("button", { name: "이 칸으로 이동" })).toBeVisible();
  await expect(page.locator("#console-panel-home .token-wrapper")).toHaveAttribute("data-pawn-style", "heart-chip");
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("board sequence and resize keep stable references and can be undone", async ({
  page,
}) => {
  const state = await fixture(page);
  await selectCell(page, 2);
  await config(page)
    .getByRole("button", { name: "순서 바꾸기", exact: true })
    .click();
  await config(page)
    .getByRole("button", { name: "한 칸 뒤로", exact: true })
    .click();
  await expect(
    config(page).locator(`[data-cell-id="${board.path[1]}"]`),
  ).toHaveAttribute("aria-label", "3번 술 한잔");
  await config(page)
    .getByRole("button", { name: "편집 되돌리기", exact: true })
    .click();
  await expect(
    config(page).locator(`[data-cell-id="${board.path[1]}"]`),
  ).toHaveAttribute("aria-label", "2번 술 한잔");
  await config(page)
    .getByRole("button", { name: "판 설정", exact: true })
    .click();
  await config(page).getByLabel("가로 (칸)", { exact: true }).fill("10");
  expect(await config(page).locator("[data-cell-id]").count()).toBe(26);
  await config(page)
    .getByRole("button", { name: "변경 내용 확인", exact: true })
    .click();
  await config(page)
    .getByRole("button", { name: "이 배치로 변경", exact: true })
    .click();
  expect(await config(page).locator("[data-cell-id]").count()).toBe(28);
  await config(page)
    .getByRole("button", { name: "초안 저장", exact: true })
    .click();
  await expect(
    config(page).getByText("초안 저장됨", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0].body.document.path.slice(0, 26)).toEqual(board.path);
  expect(state.errors).toEqual([]);
});

test("multiple arrival and safe pass effects are editable; draft preview never sends game commands", async ({
  page,
}) => {
  const state = await fixture(page);
  await selectCell(page, 2);
  await config(page)
    .getByRole("button", { name: "동작 하나 더 추가", exact: true })
    .click();
  await expect(
    config(page).getByLabel("미션 문구", { exact: true }),
  ).toHaveCount(2);
  await config(page)
    .getByRole("button", { name: "지나갈 때", exact: true })
    .click();
  await config(page)
    .getByRole("button", { name: "동작 추가", exact: true })
    .click();
  await config(page).getByLabel("할 일", { exact: true }).click();
  await expect(
    page.getByRole("option", { name: "앞으로 / 뒤로 이동", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: "아이템 받기", exact: true }).click();
  await config(page).getByRole("button", { name: "이동", exact: true }).click();
  await expect(config(page).getByLabel("미리보기 말")).toBeVisible();
  expect(state.writes).toEqual([]);
  await config(page)
    .getByRole("button", { name: "초안 저장", exact: true })
    .click();
  await expect(
    config(page).getByText("초안 저장됨", { exact: true }),
  ).toBeVisible();
  expect(state.writes[0].body.document.cells[1].onLand).toHaveLength(2);
  expect(state.writes[0].body.document.cells[1].onPass[0].type).toBe(
    "grant_item",
  );
  expect(state.errors).toEqual([]);
});

test("donation cards use exact matching and show duplicate amounts and disabled multi-rolls", async ({
  page,
}) => {
  const state = await fixture(page);
  await page.getByRole("tablist", { name: "운영 콘솔 메뉴" }).getByRole("tab", { name: "게임 규칙" }).click();
  const region = page.getByRole("region", {
    name: "후원 규칙 설정",
    exact: true,
  });
  await region.getByLabel("후원 미리보기 개수").fill("66");
  await expect(
    region.getByText("등록된 개수가 아니어서 아무 동작도 하지 않아요.", {
      exact: true,
    }),
  ).toBeVisible();
  await region.getByLabel("정확히 이 개수의 별풍선을 받으면").fill("52");
  await expect(
    region.getByText(
      "같은 개수가 다른 규칙에 있어요. 꺼진 규칙도 서로 다른 개수를 사용해야 해요.",
      { exact: true },
    ),
  ).toBeVisible();
  await region.getByLabel("정확히 이 개수의 별풍선을 받으면").fill("66");
  await region.getByLabel("주사위 굴리는 횟수").fill("2");
  await expect(
    region.getByText("연속 주사위가 꺼져 있어 실행하지 않아요.", {
      exact: true,
    }),
  ).toBeVisible();
  await region
    .getByRole("switch", { name: "연속 주사위 허용", exact: true })
    .check();
  await expect(region.getByRole("status").filter({ hasText: "주사위 2회 굴리기" })).toBeVisible();
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("revision conflicts keep edited values", async ({ page }) => {
  const state = await fixture(page, { conflict: true });
  await selectCell(page, 2);
  await config(page).getByLabel("칸 이름", { exact: true }).fill("보존할 수정");
  await config(page)
    .getByRole("button", { name: "초안 저장", exact: true })
    .click();
  await expect(config(page).getByRole("alert")).toContainText(
    "다른 곳에서 설정이 변경됐어요",
  );
  await expect(config(page).getByLabel("칸 이름", { exact: true })).toHaveValue(
    "보존할 수정",
  );
  expect(state.errors).toEqual([]);
});

test("responsive editor contains the board scroll and supports artwork selection without losing the inspector", async ({
  page,
}) => {
  const state = await fixture(page);
  await selectCell(page, 2);
  await config(page)
    .getByRole("button", { name: "꾸미기", exact: true })
    .click();
  await config(page).getByRole("button", { name: "노래", exact: true }).click();
  await config(page)
    .getByRole("button", { name: "초안 저장", exact: true })
    .click();
  await expect(
    config(page).getByText("초안 저장됨", { exact: true }),
  ).toBeVisible();
  expect(
    state.writes[0].body.document.cells[1].appearance.artwork.assetId,
  ).toBe("party-music-v1");
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
  expect(state.errors).toEqual([]);
});

test("failed configuration loads require retry and never expose a blank writable replacement", async ({
  page,
}) => {
  const options = { loadError: true };
  const state = await fixture(page, options);
  await expect(
    config(page).getByText("테스트: 설정을 불러오지 못했어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    config(page).getByRole("button", { name: "초안 저장", exact: true }),
  ).toHaveCount(0);
  options.loadError = false;
  await config(page)
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(config(page).locator("[data-cell-id]")).toHaveCount(26);
  expect(state.writes).toEqual([]);
  expect(state.errors).toEqual([]);
});

test("board themes preview without game writes and publish only the selected visual setting", async ({ page }) => {
  const state = await fixture(page);
  if (page.viewportSize()!.width >= 1280) {
    await page.setViewportSize({ width: 2200, height: 1000 });
  }
  await page.getByRole("tab", { name: "방송 테마·배치", exact: true }).click();
  await expect(page.getByRole("button", { name: /클래식 파티/ })).toHaveCount(0);
  const region = page.getByRole("region", { name: "방송 테마·배치 설정", exact: true });
  await expect(region.getByRole("note")).toContainText("운영 화면·OBS에 반영");
  const editorBox = await region.getByTestId("broadcast-layout-editor").boundingBox();
  const regionBox = await region.boundingBox();
  const workspaceBox = await page.getByTestId("configuration-workspace").boundingBox();
  expect(editorBox).not.toBeNull();
  expect(regionBox).not.toBeNull();
  expect(workspaceBox).not.toBeNull();
  expect(workspaceBox!.width).toBeLessThanOrEqual(1601);
  expect(workspaceBox!.width).toBeGreaterThanOrEqual(regionBox!.width);
  if (page.viewportSize()!.width >= 2200) {
    expect(workspaceBox!.width).toBeGreaterThanOrEqual(1599);
    expect(workspaceBox!.x).toBeGreaterThan(200);
  }
  expect(editorBox!.width).toBeGreaterThan(regionBox!.width * 0.95);
  await expect(region.getByRole("group", { name: "기본 테마 선택" }).getByRole("button")).toHaveCount(6);
  if (page.viewportSize()!.width >= 1280) {
    const themeBox = await region.getByRole("group", { name: "기본 테마 선택" }).boundingBox();
    expect(themeBox!.width).toBeGreaterThan(650);
  }
  await expect(region.getByText("방송 게임판 미리보기")).toBeVisible();
  const panelTabs = region.getByRole("tablist", { name: "방송 패널 내용" });
  await expect(region.getByRole("textbox", { name: "메뉴판 제목" })).toHaveCount(0);
  await panelTabs.getByRole("tab", { name: "후원 메뉴" }).click();
  await expect(region.getByRole("tabpanel", { name: "후원 메뉴" }).getByRole("textbox", { name: "메뉴판 제목" })).toBeVisible();
  await panelTabs.getByRole("tab", { name: "주사위 가격" }).click();
  await expect(region.getByRole("button", { name: "라임 클로버 선택됨", exact: true })).toHaveAttribute("aria-pressed", "true");
  await region.getByRole("button", { name: "핑크 버니 선택", exact: true }).click();
  await expect(region.getByRole("button", { name: "핑크 버니 선택됨", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(state.writes).toEqual([]);
  await page.getByRole("tab", { name: "홈", exact: true }).click();
  await page.getByRole("tab", { name: "보드 설정", exact: true }).click();
  await expect(region.getByRole("button", { name: "핑크 버니 선택됨", exact: true })).toBeVisible();
  await region.getByRole("button", { name: "검사하고 게시", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.writes[0].body.document).toEqual({ ...state.documents["overlay-layout"], boardThemeId: "pink-bunny" });
  await page.getByRole("dialog").getByRole("button", { name: "게시하기", exact: true }).click();
  await expect(region.getByRole("button", { name: "게시됨", exact: true })).toBeDisabled();
  expect(state.writes.map(w => [w.kind, w.verb])).toEqual([
    ["overlay-layout", "POST"], ["overlay-layout", "validate"], ["overlay-layout", "publish"],
  ]);
  expect(state.errors).toEqual([]);
});


test("retired theme drafts load as lime and are rewritten before publishing", async ({ page }) => {
  const state = await fixture(page, { legacyTheme: true });
  await page.getByRole("tab", { name: "방송 테마·배치", exact: true }).click();
  const region = page.getByRole("region", { name: "방송 테마·배치 설정", exact: true });
  await expect(region.getByRole("button", { name: "라임 클로버 선택됨", exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: /클래식 파티/ })).toHaveCount(0);
  await region.getByRole("button", { name: "검사하고 게시", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(state.writes.map(write => write.verb)).toEqual(["PUT", "validate"]);
  expect(state.writes[0].body.document).toEqual({ ...state.documents["overlay-layout"], boardThemeId: "lime-clover" });
  expect(state.errors).toEqual([]);
});
