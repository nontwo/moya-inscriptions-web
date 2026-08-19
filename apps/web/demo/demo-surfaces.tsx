"use client";

import { useMemo, useState } from "react";

import { ContentWall } from "../product-shell/content-wall";
import {
  demoCalligraphy,
  demoInscriptions,
  demoNearbyRecords,
  demoTopics,
  type DemoCatalogRecord,
  type DemoContentId,
  type DemoTopicId,
} from "./demo-data";
import styles from "./demo.module.css";

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);

const normalizeQuery = (value: string) =>
  value.trim().toLocaleLowerCase("zh-CN");

export function DemoContentCard({
  record,
  onOpen,
}: {
  record: DemoCatalogRecord;
  onOpen: (id: DemoContentId) => void;
}) {
  const representative = record.media[0];
  return (
    <button
      className={styles.contentCard}
      data-content-wall-card
      data-demo-content-id={record.id}
      onClick={() => onOpen(record.id)}
      role="listitem"
      type="button"
    >
      {representative === undefined ? (
        <span
          className={styles.mediaFallback}
          role="img"
          aria-label="暂无演示图像"
        />
      ) : (
        <img
          alt={representative.alt}
          className={styles.cardImage}
          height={representative.height}
          src={representative.src}
          width={representative.width}
        />
      )}
      <span className={styles.cardCaption}>
        <span className={styles.cardTitle}>{record.title}</span>
        {record.periodLabel || record.styleLabel ? (
          <span className={styles.cardMeta}>
            {[record.periodLabel, record.styleLabel]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function DemoNearbySurface({
  onOpenDetail,
}: {
  onOpenDetail: (id: DemoContentId) => void;
}) {
  return (
    <section aria-labelledby="nearby-heading" data-demo-surface="nearby">
      <h2 className="yoyi-visually-hidden" id="nearby-heading">
        附近
      </h2>
      <ContentWall label="附近演示内容">
        {demoNearbyRecords.map((record) => (
          <DemoContentCard
            key={record.id}
            onOpen={onOpenDetail}
            record={record}
          />
        ))}
      </ContentWall>
    </section>
  );
}

export function DemoTopicsSurface({
  onOpenTopic,
}: {
  onOpenTopic: (id: DemoTopicId) => void;
}) {
  return (
    <section aria-labelledby="topics-heading" data-demo-surface="topics">
      <h2 className="yoyi-visually-hidden" id="topics-heading">
        专题
      </h2>
      <ContentWall label="专题演示内容">
        {demoTopics.map((topic) => (
          <button
            className={styles.contentCard}
            data-content-wall-card
            data-demo-topic-id={topic.id}
            key={topic.id}
            onClick={() => onOpenTopic(topic.id)}
            role="listitem"
            type="button"
          >
            <img
              alt={topic.coverAlt}
              className={styles.cardImage}
              height={900}
              src={topic.cover}
              width={1200}
            />
            <span className={styles.cardCaption}>
              <span className={styles.cardTitle}>{topic.title}</span>
              <span className={styles.cardMeta}>{topic.blurb}</span>
            </span>
          </button>
        ))}
      </ContentWall>
    </section>
  );
}

export function DemoInscriptionSurface({
  onOpenDetail,
  onOpenSettings,
}: {
  onOpenDetail: (id: DemoContentId) => void;
  onOpenSettings: () => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = normalizeQuery(query);
  const records = useMemo(
    () =>
      normalized.length === 0
        ? demoInscriptions
        : demoInscriptions.filter((record) =>
            normalizeQuery(record.searchText).includes(normalized),
          ),
    [normalized],
  );

  return (
    <section
      aria-label="碑刻"
      className={styles.surface}
      data-demo-surface="inscriptions"
    >
      <header className={styles.searchTopBar}>
        <label className={`yoyi-search-input ${styles.search}`}>
          <span className="yoyi-visually-hidden">搜索碑刻</span>
          <input
            aria-label="搜索碑刻"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="搜索碑刻"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="清除搜索"
              className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--sm"
              onClick={() => setQuery("")}
              type="button"
            >
              {icon("close")}
            </button>
          ) : null}
        </label>
        <button
          aria-label="打开设置"
          className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
          onClick={onOpenSettings}
          type="button"
        >
          {icon("settings")}
        </button>
      </header>
      <main className={styles.scroll} data-surface-scroll="inscriptions">
        <div className={styles.inscriptionList} role="list">
          {records.map((record) => {
            const image = record.media[0];
            return (
              <button
                className={styles.inscriptionCard}
                data-demo-content-id={record.id}
                key={record.id}
                onClick={() => onOpenDetail(record.id)}
                role="listitem"
                type="button"
              >
                {image === undefined ? (
                  <span
                    className={styles.inscriptionFallback}
                    aria-label="暂无演示图像"
                    role="img"
                  />
                ) : (
                  <img
                    alt={image.alt}
                    height={image.height}
                    src={image.src}
                    width={image.width}
                  />
                )}
                <span className={styles.inscriptionBody}>
                  <span className={styles.inscriptionTitle}>
                    {record.title}
                  </span>
                  <span className={styles.cardMeta}>
                    碑刻{record.periodLabel ? ` · ${record.periodLabel}` : ""}
                  </span>
                </span>
                {icon("next")}
              </button>
            );
          })}
          {records.length === 0 ? <p role="status">未找到碑刻</p> : null}
        </div>
      </main>
    </section>
  );
}

type CalligraphyCategory = "all" | "ink" | "rubbing";

export function DemoCalligraphySurface({
  onOpenDetail,
  onOpenSettings,
}: {
  onOpenDetail: (id: DemoContentId) => void;
  onOpenSettings: () => void;
}) {
  const [category, setCategory] = useState<CalligraphyCategory>("all");
  const [query, setQuery] = useState("");
  const normalized = normalizeQuery(query);
  const records = useMemo(
    () =>
      demoCalligraphy.filter(
        (record) =>
          (category === "all" || record.category === category) &&
          (normalized.length === 0 ||
            normalizeQuery(record.searchText).includes(normalized)),
      ),
    [category, normalized],
  );

  return (
    <section
      aria-label="书帖"
      className={styles.surface}
      data-demo-surface="calligraphy"
    >
      <header className={styles.calligraphyTopBar}>
        <div aria-label="书帖分类" className={styles.categories} role="tablist">
          {[
            ["all", "全部"],
            ["ink", "墨迹"],
            ["rubbing", "拓本"],
          ].map(([value, label]) => (
            <button
              aria-selected={category === value}
              className={category === value ? styles.selectedTab : undefined}
              key={value}
              onClick={() => setCategory(value as CalligraphyCategory)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <label className={`yoyi-search-input ${styles.calligraphySearch}`}>
          <span className="yoyi-visually-hidden">筛选书帖</span>
          <input
            aria-label="筛选书帖"
            onChange={(event) => setQuery(event.currentTarget.value)}
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="清除筛选"
              className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--sm"
              onClick={() => setQuery("")}
              type="button"
            >
              {icon("close")}
            </button>
          ) : null}
        </label>
        <button
          aria-label="打开设置"
          className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
          onClick={onOpenSettings}
          type="button"
        >
          {icon("settings")}
        </button>
      </header>
      <main className={styles.scroll} data-surface-scroll="calligraphy">
        {records.length === 0 ? (
          <p className={styles.empty} role="status">
            没有符合筛选的书帖
          </p>
        ) : (
          <ContentWall label="书帖演示内容">
            {records.map((record) => (
              <DemoContentCard
                key={record.id}
                onOpen={onOpenDetail}
                record={record}
              />
            ))}
          </ContentWall>
        )}
      </main>
    </section>
  );
}
