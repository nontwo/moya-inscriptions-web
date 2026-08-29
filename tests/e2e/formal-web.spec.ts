import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const runtimeIds = {
  calligraphy: "runtime-calligraphy",
  mismatch: "runtime-identity-mismatch",
  multiMedia: "runtime-inscription-multi-media",
  noMedia: "runtime-inscription-no-media",
} as const;

type PresentationPlatform = "pc" | "phone" | "tablet";

const expectedInitialPlatform = (projectName: string): PresentationPlatform => {
  if (projectName === "mobile-webkit") return "phone";
  if (projectName.startsWith("tablet")) return "tablet";
  return "pc";
};

const formalSurface = (page: Page) =>
  page.locator("[data-clean-product-preview]");

const productShell = (page: Page) =>
  formalSurface(page).locator("[data-product-shell]");

const primaryNavigation = (page: Page) =>
  formalSurface(page).getByRole("navigation", { name: "主要内容" });

const activeCatalogOpener = (shell: Locator, catalogId: string) =>
  shell
    .locator("[data-primary-destination]:not([hidden])")
    .locator(`[data-catalog-id="${catalogId}"] [data-open-catalog]`);

const selectPrimaryDestination = async (
  page: Page,
  name: "书帖" | "碑刻" | "首页",
  destination: "calligraphy" | "home" | "inscriptions",
) => {
  await primaryNavigation(page)
    .getByRole("button", { exact: true, name })
    .click();
  await expect(productShell(page)).toHaveAttribute(
    "data-active-destination",
    destination,
  );
};

const openFormalRoot = async (page: Page, target = "/") => {
  const response = await page.goto(target);
  expect(response?.status()).toBe(200);
  const surface = formalSurface(page);
  const shell = productShell(page);
  await expect(surface).toBeVisible();
  await expect(shell).toBeVisible();
  await expect(surface.locator("[data-product-boot]")).toHaveCount(0);
  return { shell, surface };
};

const detailDialog = (page: Page) =>
  productShell(page).getByRole("dialog", { name: "资料详情" });

const viewerDialog = (page: Page) =>
  productShell(page).getByRole("dialog", { name: "图像查看" });

const isFormalPrimaryUrl = (url: URL) =>
  url.pathname === "/" &&
  url.searchParams.get("catalogId") === null &&
  url.searchParams.get("image") === null &&
  url.hash === "";

const isFormalDetailUrl = (url: URL, catalogId: string) =>
  url.pathname === "/" &&
  url.searchParams.get("catalogId") === catalogId &&
  url.searchParams.get("image") === null &&
  url.hash === "#detail";

const isFormalViewerUrl = (url: URL, catalogId: string, mediaId: string) =>
  url.pathname === "/" &&
  url.searchParams.get("catalogId") === catalogId &&
  url.searchParams.get("image") === mediaId &&
  url.hash === "#viewer";

test("Formal root serves only the request-rendered React Product Shell", async ({
  page,
  request,
}, testInfo) => {
  const getResponse = await request.get("/");
  expect(getResponse.status()).toBe(200);
  const initialHtml = await getResponse.text();
  expect(initialHtml).toContain("data-product-shell");
  expect(initialHtml).toContain("data-clean-product-preview");
  expect(initialHtml).not.toContain('data-formal-root="true"');
  expect(initialHtml).not.toContain("data-mobile-app");

  const headResponse = await request.head("/");
  expect(headResponse.status()).toBe(200);
  expect(await headResponse.body()).toHaveLength(0);

  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydration/iu.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (/hydration/iu.test(error.message)) hydrationErrors.push(error.message);
  });
  await page.addInitScript(() => {
    const runtime = window as Window & {
      __moyaOldFormalObserved?: boolean;
    };
    runtime.__moyaOldFormalObserved = false;
    const observeOldFormal = () => {
      if (
        document.documentElement?.hasAttribute("data-formal-root") === true ||
        document.querySelector("[data-mobile-app]") !== null
      ) {
        runtime.__moyaOldFormalObserved = true;
      }
    };
    observeOldFormal();
    new MutationObserver(observeOldFormal).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });

  const { shell, surface } = await openFormalRoot(page);
  await expect(shell).toHaveAttribute(
    "data-platform",
    expectedInitialPlatform(testInfo.project.name),
  );
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __moyaOldFormalObserved?: boolean })
          .__moyaOldFormalObserved,
    ),
  ).toBe(false);
  expect(hydrationErrors).toEqual([]);
  await expect(page.locator('html[data-formal-root="true"]')).toHaveCount(0);
  await expect(page.locator("[data-mobile-app]")).toHaveCount(0);
  await expect(
    surface.locator(
      [
        "[data-qa-controls]",
        "[data-t02p-qa-harness]",
        "[data-development-primary-pager]",
        '[data-catalog-id^="qa-"]',
        '[data-media-id^="qa-"]',
      ].join(", "),
    ),
  ).toHaveCount(0);
  await expect(
    surface.locator(
      'input[type="search"], [role="search"], [data-calligraphy-filter]',
    ),
  ).toHaveCount(0);
});

test("Formal root composes only truthful Production list states", async ({
  page,
}) => {
  const { shell } = await openFormalRoot(page);
  const home = shell.locator("[data-home-surface]");
  await expect(
    home.locator(
      `[data-home-feed-panel="discover"] [data-catalog-id="${runtimeIds.multiMedia}"]`,
    ),
  ).toContainText("运行时多图碑刻");
  await expect(home.locator('[data-home-feed-panel="nearby"]')).toContainText(
    "附近内容尚未接入",
  );
  await expect(home.locator('[data-home-feed-panel="topics"]')).toContainText(
    "专题内容尚未接入",
  );

  await expect(
    shell.locator(
      `[data-primary-destination="inscriptions"] [data-catalog-id="${runtimeIds.noMedia}"]`,
    ),
  ).toContainText("运行时无图碑刻");

  const calligraphy = shell.locator("[data-calligraphy-category-surface]");
  await expect(calligraphy).toHaveAttribute(
    "data-calligraphy-classification-source",
    "runtime-unclassified",
  );
  await expect(
    calligraphy.locator(
      `[data-calligraphy-category-panel="all"] [data-catalog-id="${runtimeIds.calligraphy}"]`,
    ),
  ).toContainText("运行时书帖");
  await expect(
    calligraphy.locator('[data-calligraphy-category-panel="ink"]'),
  ).toContainText("墨迹分类数据尚未接入");
  await expect(
    calligraphy.locator('[data-calligraphy-category-panel="rubbing"]'),
  ).toContainText("拓本分类数据尚未接入");
  await expect(calligraphy).not.toContainText("视觉 QA 合成");
});

test("Formal Home, Inscriptions, and Calligraphy reuse one Detail and Viewer journey", async ({
  page,
}) => {
  const { shell } = await openFormalRoot(page);
  const detail = detailDialog(page);

  const openAndReturn = async (catalogId: string, title: string) => {
    const opener = activeCatalogOpener(shell, catalogId);
    await Promise.all([
      page.waitForURL((url) => isFormalDetailUrl(url, catalogId), {
        timeout: 10_000,
      }),
      opener.click(),
    ]);
    await expect(detail).toBeVisible();
    await expect(detail).toHaveAttribute("data-detail-source", "runtime");
    await expect(detail.locator("[data-detail-title]")).toHaveText(title);
    await Promise.all([
      page.waitForURL(isFormalPrimaryUrl, { timeout: 10_000 }),
      detail.getByRole("button", { exact: true, name: "返回" }).click(),
    ]);
    await expect(detail).toHaveCount(0);
    await expect(opener).toBeFocused();
  };

  await openAndReturn(runtimeIds.noMedia, "运行时无图碑刻");

  await selectPrimaryDestination(page, "碑刻", "inscriptions");
  const inscriptionsOpener = activeCatalogOpener(shell, runtimeIds.multiMedia);
  await Promise.all([
    page.waitForURL((url) => isFormalDetailUrl(url, runtimeIds.multiMedia), {
      timeout: 10_000,
    }),
    inscriptionsOpener.click(),
  ]);
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-detail-title]")).toHaveText(
    "运行时多图碑刻",
  );
  await Promise.all([
    page.waitForURL(
      (url) =>
        isFormalViewerUrl(
          url,
          runtimeIds.multiMedia,
          "runtime-inscription-front",
        ),
      { timeout: 10_000 },
    ),
    detail.locator("[data-detail-main-image]").click(),
  ]);
  const viewer = viewerDialog(page);
  await expect(viewer).toBeVisible();
  await Promise.all([
    page.waitForURL((url) => isFormalDetailUrl(url, runtimeIds.multiMedia), {
      timeout: 10_000,
    }),
    page.keyboard.press("Escape"),
  ]);
  await expect(viewer).toBeHidden();
  await expect(detail).toBeVisible();
  await Promise.all([
    page.waitForURL(isFormalPrimaryUrl, { timeout: 10_000 }),
    detail.getByRole("button", { exact: true, name: "返回" }).click(),
  ]);
  await expect(detail).toHaveCount(0);
  await expect(inscriptionsOpener).toBeFocused();

  await selectPrimaryDestination(page, "书帖", "calligraphy");
  await openAndReturn(runtimeIds.calligraphy, "运行时书帖");
});

test("Formal query Detail and Viewer preserve Back, Forward, and reload", async ({
  page,
}) => {
  await openFormalRoot(page, `/?catalogId=${runtimeIds.multiMedia}`);
  const detail = detailDialog(page);
  const viewer = viewerDialog(page);
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-detail-title]")).toHaveText(
    "运行时多图碑刻",
  );

  await detail.locator("[data-detail-main-image]").click();
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(/image=runtime-inscription-front/u);

  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]image=/u);

  await page.goForward();
  await expect(viewer).toBeVisible();
  await page.reload();
  await expect(viewer).toBeVisible();
  await expect(detail).toBeVisible();

  await openFormalRoot(
    page,
    `/?catalogId=${runtimeIds.multiMedia}&image=runtime-inscription-detail`,
  );
  await expect(viewerDialog(page)).toBeVisible();
  await expect(
    viewerDialog(page).locator("[data-detail-viewer-image]"),
  ).toHaveAttribute("alt", "运行时多图碑刻局部");
});

test("Catalog redirect remains 307 and Formal Detail failures stay truthful", async ({
  page,
  request,
}) => {
  const redirect = await request.get(`/catalog/${runtimeIds.multiMedia}`, {
    maxRedirects: 0,
  });
  expect(redirect.status()).toBe(307);
  const location = redirect.headers().location;
  expect(location).toBeDefined();
  const destination = new URL(location!);
  expect(destination.pathname).toBe("/");
  expect(destination.searchParams.get("catalogId")).toBe(runtimeIds.multiMedia);
  expect(destination.hash).toBe(`#detail-${runtimeIds.multiMedia}`);

  await openFormalRoot(page, `/catalog/${runtimeIds.multiMedia}`);
  await expect(detailDialog(page).locator("[data-detail-title]")).toHaveText(
    "运行时多图碑刻",
  );

  await openFormalRoot(page, `/?catalogId=${runtimeIds.noMedia}`);
  await expect(
    detailDialog(page).locator('[data-detail-media-state="missing"]'),
  ).toBeVisible();
  await expect(detailDialog(page)).toContainText("暂无公开图像");

  await page.route(`**/api/catalog/${runtimeIds.multiMedia}`, async (route) =>
    route.fulfill({ status: 503 }),
  );
  await openFormalRoot(page, `/?catalogId=${runtimeIds.multiMedia}`);
  await expect(detailDialog(page)).toContainText("暂时无法加载资料");
  await page.unroute(`**/api/catalog/${runtimeIds.multiMedia}`);

  await openFormalRoot(page, `/?catalogId=${runtimeIds.mismatch}`);
  await expect(detailDialog(page)).toContainText("暂时无法显示此页面");
  await expect(detailDialog(page)).not.toContainText("错误替代资源");
});
