// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { author } = vi.hoisted(() => ({
  author: { viewer: null as { id: string } | null, checking: false },
}));
vi.mock("../authors/author-context", () => ({ useAuthors: () => author }));

import { identifyFiles } from "./import-grouping";
import { fileOf, jpeg } from "./parsers/synthetic-media.test-support";
import {
  PublishingProvider,
  useGlobalUploadProgress,
  useStagedItems,
  useSubmission,
  useUploadSession,
} from "./publishing-provider";
import {
  ACCOUNT,
  OTHER_ACCOUNT,
  SESSION_ID,
  fakeClient,
  fakePreprocess,
  fakeTransfer,
  manualTimers,
  settle,
  absentMetadata,
  uuid,
} from "./upload-manager.test-support";

import type {
  PublishingClientPort,
  PublishingServices,
} from "./publishing-runtime";
import type { Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

interface Hooks {
  session: ReturnType<typeof useUploadSession>;
  staged: ReturnType<typeof useStagedItems>;
  progress: ReturnType<typeof useGlobalUploadProgress>;
  submission: ReturnType<typeof useSubmission>;
}

const latest: { current: Hooks | null } = { current: null };

const Probe = () => {
  latest.current = {
    session: useUploadSession(),
    staged: useStagedItems(),
    progress: useGlobalUploadProgress(),
    submission: useSubmission(),
  };
  return null;
};

const services = (): {
  services: PublishingServices;
  account: { id: string | null };
} => {
  const uploads = fakeClient();
  const account = { id: null as string | null };
  const client = {
    ...uploads.client,
    limits: vi.fn(async () => ({
      maxItems: 50,
      originalItemMaxBytes: 1_000_000,
      standardComponentMaxBytes: 1_000_000,
      titleMax: 200,
      bodyMax: 10_000,
    })),
    createSession: vi.fn(async () => ({
      id: SESSION_ID,
      state: "active" as const,
      workId: null,
      leaseExpiresAt: "2026-09-13T12:00:00.000Z",
      createdAt: "2026-09-13T12:00:00.000Z",
    })),
  };
  return {
    account,
    services: {
      client: client as unknown as PublishingClientPort,
      currentAccount: () => account.id,
      requestId: uuid,
      createTransfer: () => fakeTransfer().transfer,
      createPreprocess: () => fakePreprocess(),
      createHasher: () => null,
      createRecovery: () => null,
      identifyFiles: (files) => identifyFiles(files),
      preprocessConcurrency: () => 1,
      transferConcurrency: 2,
      deviceClass: () => "desktop",
      timers: manualTimers().timers,
      metadata: absentMetadata,
    },
  };
};

describe("PublishingProvider hooks", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    author.viewer = null;
    latest.current = null;
  });

  it("exposes an account-keyed session, staging and progress, isolated on account change", async () => {
    const fake = services();
    author.viewer = { id: ACCOUNT };
    fake.account.id = ACCOUNT;
    await act(async () => {
      root.render(
        <PublishingProvider services={fake.services}>
          <Probe />
        </PublishingProvider>,
      );
    });
    expect(latest.current!.session.accountId).toBe(ACCOUNT);
    await act(async () => {
      latest.current!.session.startSession({
        target: { type: "new" },
        saveMode: "unsaved",
      });
    });
    expect(latest.current!.session.session).toMatchObject({
      saveMode: "unsaved",
    });
    await act(async () => {
      await latest.current!.staged.stageFiles([fileOf(jpeg({}))], "picker");
    });
    expect(latest.current!.staged.staging?.count).toMatchObject({
      ready: 1,
      total: 1,
    });
    await act(async () => {
      expect(latest.current!.staged.confirm().ok).toBe(true);
      await settle();
    });
    expect(latest.current!.session.uploads?.items).toHaveLength(1);
    expect(latest.current!.progress).toMatchObject({
      active: true,
      itemCount: 1,
      paused: false,
    });
    expect(latest.current!.submission.state).toEqual({ status: "idle" });

    author.viewer = { id: OTHER_ACCOUNT };
    fake.account.id = OTHER_ACCOUNT;
    await act(async () => {
      root.render(
        <PublishingProvider services={fake.services}>
          <Probe />
        </PublishingProvider>,
      );
    });
    expect(latest.current!.session.accountId).toBe(OTHER_ACCOUNT);
    expect(latest.current!.session.session).toBeNull();
    expect(latest.current!.session.uploads?.items).toHaveLength(0);
    expect(latest.current!.progress).toMatchObject({
      active: false,
      itemCount: 0,
    });
  });
});
