"use client";

import { useId, useRef, useState } from "react";

import { CommentComposerPortalProvider } from "../comments/comment-composer-portal";
import { HorizontalPager } from "../shell/horizontal-pager";
import styles from "./catalog-detail.module.css";

import type { ReactNode } from "react";
import type { HorizontalPagerHandle } from "../shell/horizontal-pager";
import type { PresentationPlatform } from "../shell/device-platform";

const detailContentPages = ["information", "comments"] as const;
type DetailContentPage = (typeof detailContentPages)[number];

export interface CatalogDetailContentPagerProps {
  readonly comments: ReactNode;
  readonly information: ReactNode;
  readonly platform: Exclude<PresentationPlatform, "pc">;
}

export const CatalogDetailContentPager = ({
  comments,
  information,
  platform,
}: CatalogDetailContentPagerProps) => {
  const [activePage, setActivePage] =
    useState<DetailContentPage>("information");
  const [composerPortalTarget, setComposerPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const pagerRef = useRef<HorizontalPagerHandle<DetailContentPage>>(null);
  const id = useId();
  const selectPage = (page: DetailContentPage) => {
    pagerRef.current?.scrollToKey(page);
  };

  return (
    <section
      className={styles.contentPager}
      data-detail-content-active-page={activePage}
      data-detail-content-pager=""
    >
      <div
        aria-label="详情内容"
        className={styles.contentPagerTabs}
        role="tablist"
      >
        <button
          aria-controls={`${id}-information-panel`}
          aria-selected={activePage === "information"}
          id={`${id}-information-tab`}
          onClick={() => selectPage("information")}
          role="tab"
          type="button"
        >
          资料
        </button>
        <button
          aria-controls={`${id}-comments-panel`}
          aria-selected={activePage === "comments"}
          id={`${id}-comments-tab`}
          onClick={() => selectPage("comments")}
          role="tab"
          type="button"
        >
          评论
        </button>
      </div>
      <HorizontalPager
        ref={pagerRef}
        activeKey={activePage}
        diagnosticPrefix="detail-content"
        frameAttributes={{ "data-detail-content-frame": "" }}
        frameClassName={styles.contentPagerFrame}
        keys={detailContentPages}
        onCommit={setActivePage}
        panelAttributes={(page, selected) => ({
          "data-active": String(selected),
          "data-detail-content-panel": page,
        })}
        panelClassName={styles.contentPagerPanel}
        panelId={(page) => `${id}-${page}-panel`}
        panelLabelledBy={(page) => `${id}-${page}-tab`}
        panels={{
          comments: (
            <CommentComposerPortalProvider target={composerPortalTarget}>
              {comments}
            </CommentComposerPortalProvider>
          ),
          information,
        }}
        platform={platform}
        scrollOwner="document"
        trackAttributes={{ "data-detail-content-track": "" }}
        trackClassName={styles.contentPagerTrack}
      />
      <div
        data-active={String(activePage === "comments")}
        data-comment-composer-outlet=""
        ref={setComposerPortalTarget}
      />
    </section>
  );
};
