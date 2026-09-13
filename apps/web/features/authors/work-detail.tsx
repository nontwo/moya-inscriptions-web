"use client";
import { useEffect } from "react";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import { authorClient, AuthorRequestError } from "./author-data";
import { useAuthors } from "./author-context";
import { ContentActions } from "./content-actions";
import { useProductShell } from "../product-shell/product-shell";
import { recordLocalHistory } from "./local-library";
export const loadWorkDetail: CatalogDetailPresentationLoader = async (
  id,
  signal,
) => {
  try {
    const work = await authorClient.work(id, signal);
    return {
      state: "loaded",
      detail: {
        contentType: "work",
        id: work.id,
        authorId: work.authorId,
        authorName: work.authorName,
        canEdit: work.canEdit,
        available: work.available,
        title: work.title,
        aliases: [],
        facts: [],
        sections: work.text
          ? [{ key: "description", title: "正文", text: work.text }]
          : [],
        media: work.media.map((m) => ({ ...m, alt: work.title })),
        source: "runtime",
        sourceCitations: [],
      },
    };
  } catch (e) {
    return {
      state:
        e instanceof AuthorRequestError && e.status === 404
          ? "not-found"
          : "unavailable",
    };
  }
};
export const DetailActions = ({
  detail,
}: {
  detail: CatalogDetailPresentation;
}) => {
  const author = useAuthors(),
    shell = useProductShell();
  const target = {
    type: detail.contentType === "work" ? "work" : "catalog",
    id: detail.id,
  } as const;
  useEffect(() => {
    if (
      author.checking ||
      author.sessionError ||
      (detail.contentType === "work" && !detail.available)
    )
      return;
    try {
      recordLocalHistory(author.viewer?.id ?? null, target);
    } catch {
      author.notify("浏览记录无法保存在本机");
    }
  }, [detail.id, author.viewer?.id, author.checking]);
  return (
    <div>
      {detail.contentType === "work" && (
        <div className="phase4-actions">
          <button
            type="button"
            onClick={(e) => shell.openProfile(detail.authorId, e.currentTarget)}
          >
            {detail.authorName}
          </button>
          {!detail.available && <p>此作品当前不可公开访问。</p>}
        </div>
      )}
      {(detail.contentType !== "work" || detail.available) && (
        <ContentActions target={target} title={detail.title} />
      )}{" "}
    </div>
  );
};
