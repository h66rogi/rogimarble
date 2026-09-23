import { expect, test } from "@playwright/test";

test("unauthenticated visitors reach login without seeing management pages", async ({ page }) => {
  await page.route("**/v1/auth/session", (route) =>
    route.fulfill({ status: 401, json: { message: "Login required" } }),
  );
  await page.route("**/v1/auth/config", (route) =>
    route.fulfill({ json: { mode: "token", loginUrl: null, localLoginEnabled: false } }),
  );

  for (const path of ["/", "/account", "/collector"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("운영자 로그인", { exact: true })).toBeVisible();
    await expect(page.getByRole("tablist", { name: "운영 콘솔 메뉴" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "접근 토큰" })).toHaveCount(0);
    await expect(page.getByText("방송 조회", { exact: true })).toHaveCount(0);
  }
});

test("management content stays hidden until the session is verified", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/v1/auth/session", async (route) => {
    await pending;
    await route.fulfill({ json: {
      csrfToken: "test-csrf",
      operator: { id: "operator", username: "테스트 운영자", role: "operator" },
    } });
  });
  await page.route("**/v1/auth/tokens", (route) => route.fulfill({ json: [] }));

  try {
    await page.goto("/account");
    await expect(page.getByRole("status")).toHaveText("로그인 상태를 확인하는 중입니다.");
    await expect(page.getByRole("heading", { name: "접근 토큰" })).toHaveCount(0);
  } finally {
    release();
  }
  await expect(page.getByRole("heading", { name: "접근 토큰" })).toBeVisible();
});
