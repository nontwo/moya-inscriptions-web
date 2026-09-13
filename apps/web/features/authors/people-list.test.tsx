// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const { people } = vi.hoisted(() => ({ people: vi.fn() }));
vi.mock("./author-data", async (original) => ({
  ...(await original<typeof import("./author-data")>()),
  authorClient: { people },
}));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => ({ openProfile: vi.fn() }),
}));
import { AuthorRequestError } from "./author-data";
import { PeopleList } from "./people-list";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
const page = (name: string) => ({
  items: [
    { id: `user-${name}`, displayName: name, handle: name, avatar: null },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
});
const render = async (list: "following" | "followers", revision = 0) => {
  if (!root) {
    const node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
  }
  await act(async () =>
    root!.render(<PeopleList id="author" list={list} revision={revision} />),
  );
};
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  people.mockReset();
});
it("clears already loaded identities when a fresh read denies privacy", async () => {
  people.mockResolvedValueOnce(page("formerly-public"));
  await render("following");
  expect(document.body.textContent).toContain("formerly-public");
  people.mockRejectedValueOnce(new AuthorRequestError(404, "private"));
  await render("following", 1);
  expect(document.body.textContent).not.toContain("formerly-public");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "private",
  );
});
it("ignores the old Following response after Followers has loaded", async () => {
  let resolve!: (value: ReturnType<typeof page>) => void;
  people.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render("following");
  people.mockResolvedValueOnce(page("current-follower"));
  await render("followers");
  await act(async () => resolve(page("stale-following")));
  expect(document.body.textContent).toContain("current-follower");
  expect(document.body.textContent).not.toContain("stale-following");
});
it("retains prior public rows on a transient error and offers retry", async () => {
  people.mockResolvedValueOnce(page("retained"));
  await render("following");
  people.mockRejectedValueOnce(new AuthorRequestError(503, "unavailable"));
  await render("following", 1);
  expect(document.body.textContent).toContain("retained");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(
    "重试",
  );
});
