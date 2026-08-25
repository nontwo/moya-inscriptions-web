"use client";

import { useState } from "react";

import { Icon } from "@moya/ui";

import styles from "./topic-detail.module.css";

import type { Topic } from "./topic";

export const TopicCard = ({
  onMediaSettled,
  onOpen,
  topic,
}: {
  readonly onMediaSettled?: () => void;
  readonly onOpen: (topic: Topic, opener: HTMLButtonElement) => void;
  readonly topic: Topic;
}) => {
  const [failed, setFailed] = useState(false);
  const cover = topic.cover;

  return (
    <article role="listitem">
      <button
        type="button"
        className={styles.topicCard}
        data-topic-card=""
        data-topic-id={topic.id}
        data-topic-kind={topic.kind}
        onClick={(event) => onOpen(topic, event.currentTarget)}
      >
        {cover === undefined || failed ? (
          <span
            aria-label={
              failed
                ? `图像无法加载：${topic.title}`
                : `暂无专题封面：${topic.title}`
            }
            className={styles.coverFallback}
            data-topic-cover-state={failed ? "failed" : "missing"}
            role="img"
          >
            <Icon aria-hidden="true" name={failed ? "error" : "image"} />
          </span>
        ) : (
          <img
            alt={cover.alt}
            decoding="async"
            height={cover.height}
            loading="lazy"
            onError={() => {
              setFailed(true);
              onMediaSettled?.();
            }}
            onLoad={onMediaSettled}
            src={cover.src}
            width={cover.width}
          />
        )}
        <span className={styles.topicCardBody}>
          <span className={styles.badge}>
            {topic.kind === "editorialTopic" ? "专题/策展" : "专题"}
          </span>
          <span className={styles.topicCardTitle}>{topic.title}</span>
          <span className={styles.topicCardBlurb}>{topic.blurb}</span>
        </span>
      </button>
    </article>
  );
};
