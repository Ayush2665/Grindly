import { expect, test, type Page } from "@playwright/test";

let n = 0;
async function signIn(page: Page) {
  const email = `e2e-${Date.now()}-${++n}@example.com`;
  await page.goto("/");
  await page.getByPlaceholder("Your name").fill("E2E User");
  await page.getByPlaceholder("Email").fill(email);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Your Watch", { exact: true }).first()).toBeVisible();
}

// Link a Watch the way the iPhone app will: website shows a code, the phone redeems it and uploads.
async function linkWatch(page: Page) {
  await page.goto("/watch");
  await expect(page.getByTestId("link-badge")).toHaveText("Not linked");
  await page.getByRole("button", { name: "Show pairing code" }).click();
  const label = await page.getByTestId("pair-code").getAttribute("aria-label");
  const code = label!.replace("Pairing code ", "");
  expect(code).toMatch(/^\d{6}$/);

  const paired = await page.request.post("/api/v1/devices/pair", { data: { code } });
  expect(paired.status()).toBe(200);
  const { token } = (await paired.json()) as { token: string };

  // a used code must not work twice
  expect((await page.request.post("/api/v1/devices/pair", { data: { code } })).status()).toBe(400);

  const start = new Date(Date.now() - 3600_000);
  const up = await page.request.post("/api/v1/ingest/batch", {
    headers: { authorization: `Bearer ${token}` },
    data: { samples: [{ kind: "steps", hkUuid: `e2e-${Date.now()}`, start: start.toISOString(), end: new Date(start.getTime() + 60_000).toISOString(), value: 25, productType: "Watch7,3", wasUserEntered: false }] },
  });
  expect((await up.json()).accepted).toBe(1);
  await page.reload();
  await expect(page.getByTestId("link-badge")).toHaveText("Linked");
  return token;
}

const press = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();
const verdict = (page: Page) => page.getByTestId("verdict");

test("steps contract: link Watch, fakes are ignored, real steps verify the day", async ({ page }) => {
  await signIn(page);
  await linkWatch(page);
  await press(page, "Start steps contract");
  await expect(verdict(page)).toHaveText("Not yet");

  await press(page, "iPhone steps 12,000");
  await press(page, "Typed-in steps 12,000");
  await expect(verdict(page)).toHaveText("Not yet");
  await expect(page.getByTestId("evidence")).toContainText("Not from a Watch");
  await expect(page.getByTestId("evidence")).toContainText("Typed in by hand");

  await press(page, "10,500 steps");
  await expect(verdict(page)).toHaveText("Verified");
  await expect(page.getByTestId("steps")).toHaveText("10,525");

  await page.goto("/");
  await expect(page.getByTestId("contract")).toContainText("₹2,700 staked");
  await expect(page.getByTestId("verdict")).toHaveText("Verified");
});

test("120,000 steps is blocked as implausible", async ({ page }) => {
  await signIn(page);
  await linkWatch(page);
  await press(page, "Start steps contract");
  await press(page, "120,000 steps");
  await expect(verdict(page)).toHaveText("Not yet");
  await expect(page.getByTestId("evidence")).toContainText("Over 100,000 steps");
});

test("gym contract: bad workouts are ignored, a real one verifies", async ({ page }) => {
  await signIn(page);
  await linkWatch(page);
  await press(page, "Start gym contract");
  for (const b of ["20 min workout", "Workout, no heart rate", "Typed-in workout"]) await press(page, b);
  await expect(verdict(page)).toHaveText("Not yet");
  await expect(page.getByTestId("evidence")).toContainText("Under 30 min");
  await press(page, "45 min workout");
  await expect(verdict(page)).toHaveText("Verified");
});

test("cannot start a contract before linking a Watch", async ({ page }) => {
  await signIn(page);
  await page.goto("/watch");
  await press(page, "Start steps contract");
  await expect(page.getByRole("status")).toContainText("Link an Apple Watch first");
});

test("revoking a device stops uploads", async ({ page }) => {
  await signIn(page);
  const token = await linkWatch(page);
  await page.getByRole("button", { name: "Revoke this device" }).click();
  await expect(page.getByTestId("link-badge")).toHaveText("Not linked");
  const r = await page.request.post("/api/v1/ingest/batch", { headers: { authorization: `Bearer ${token}` }, data: { samples: [] } });
  expect(r.status()).toBe(401);
});

test("security headers are set", async ({ page }) => {
  const r = await page.request.get("/");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-powered-by"]).toBeUndefined();
});
