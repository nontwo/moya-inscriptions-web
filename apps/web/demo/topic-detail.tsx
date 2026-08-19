"use client";

import { useEffect, useRef } from "react";

import { demoTopicById, type DemoTopicId } from "./demo-data";
import styles from "./demo.module.css";

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);

export function TopicDetailSurface({
  id,
  onBack,
}: {
  id: DemoTopicId;
  onBack: () => void;
}) {
  const topic = demoTopicById.get(id);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => backRef.current?.focus());
  }, [id]);

  if (!topic) return null;
  return (
    <section
      aria-label={`${topic.title}专题`}
      className={styles.topicDetail}
      data-demo-topic-detail
    >
      <header className={styles.detailTopBar}>
        <button
          aria-label="返回"
          className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
          onClick={onBack}
          ref={backRef}
          type="button"
        >
          {icon("back")}
        </button>
        <h1>{topic.title}</h1>
        <span aria-hidden="true" />
      </header>
      <main className={styles.topicScroll}>
        <article className={styles.topicArticle}>
          <img
            alt={topic.coverAlt}
            height={900}
            src={topic.cover}
            width={1200}
          />
          <p className={styles.topicBlurb}>{topic.blurb}</p>
          {topic.blocks.map((block, index) => {
            if (block.type === "image") {
              return (
                <figure key={`${block.type}-${index}`}>
                  <img
                    alt={block.alt}
                    height={900}
                    src={block.src}
                    width={1200}
                  />
                  {block.caption ? (
                    <figcaption>{block.caption}</figcaption>
                  ) : null}
                </figure>
              );
            }
            if (block.type === "video") {
              return (
                <div
                  className={styles.videoPlaceholder}
                  key={`${block.type}-${index}`}
                >
                  {block.caption}
                </div>
              );
            }
            if (block.type === "quote") {
              return (
                <blockquote key={`${block.type}-${index}`}>
                  {block.text}
                </blockquote>
              );
            }
            return <p key={`${block.type}-${index}`}>{block.text}</p>;
          })}
        </article>
      </main>
    </section>
  );
}
