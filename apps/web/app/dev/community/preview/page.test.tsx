import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  notFoundMock,
  readDevelopmentRequestContextMock,
  loadCleanPreviewStatesMock,
} = vi.hoisted(() => ({
  notFoundMock: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  readDevelopmentRequestContextMock: vi.fn(),
  loadCleanPreviewStatesMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: notFoundMock }));
vi.mock("../../t02p/development-context", () => ({
  readDevelopmentRequestContext: readDevelopmentRequestContextMock,
}));
vi.mock("../../t02p/development-data", () => ({
  loadCleanPreviewStates: loadCleanPreviewStatesMock,
}));
vi.mock("./preview-shell", () => ({
  CommunityAcceptancePreview: (props: Record<string, unknown>) => (
    <div data-testid="preview" data-platform={String(props.initialPlatform)} />
  ),
}));

import CommunityAcceptancePreviewPage from "./page";

describe("CommunityAcceptancePreviewPage", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    readDevelopmentRequestContextMock.mockResolvedValue({
      initialPlatform: "phone",
      mediaOrigin: "http://127.0.0.1:3000",
    });
    loadCleanPreviewStatesMock.mockResolvedValue({ states: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("is unavailable in Production before loading anything", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(CommunityAcceptancePreviewPage()).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(readDevelopmentRequestContextMock).not.toHaveBeenCalled();
    expect(loadCleanPreviewStatesMock).not.toHaveBeenCalled();
  });

  it("composes the accepted preview over the runtime states in Development", async () => {
    const element = await CommunityAcceptancePreviewPage();
    expect(element.props).toMatchObject({
      initialPlatform: "phone",
      states: { states: true },
    });
    expect(loadCleanPreviewStatesMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000",
    );
  });
});
