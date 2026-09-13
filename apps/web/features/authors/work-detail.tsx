"use client";
import { useEffect, useRef, useState } from "react";
import type { UserWork } from "@moya/contracts";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import { authorClient, AuthorRequestError } from "./author-data";
import { useAuthors } from "./author-context";
import { ContentActions } from "./content-actions";
import { useAuthorOperation } from "./use-author-operation";
import { WorkEditor } from "./work-editor";
import { useProductShell } from "../product-shell/product-shell";
import { recordLocalHistory } from "./local-library";
import { requestIdentity } from "../shell/request-identity";
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
  refresh,
}: {
  detail: CatalogDetailPresentation;
  refresh: () => void;
}) => {
  const author = useAuthors(),
    shell = useProductShell(),
    [editing, setEditing] = useState<UserWork | null>(null);
  const needsRefresh = useRef(false);
  const operation = useAuthorOperation();
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
          {!detail.available && <p>此作品当前不可公开访问，编辑不会恢复它。</p>}
          {detail.canEdit &&
            author.viewer?.id === detail.authorId &&
            !author.checking &&
            !author.sessionError && (
              <>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const work = await operation.run(() =>
                        authorClient.work(detail.id),
                      );
                      if (work.canEdit && work.authorId === author.viewer?.id)
                        setEditing(work);
                    } catch (e) {
                      if (!operation.current()) return;
                      author.notify(
                        e instanceof Error ? e.message : "无法编辑",
                      );
                    }
                  }}
                >
                  编辑作品
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        "删除此作品？公开内容和编辑草稿将不可再访问。",
                      )
                    )
                      return;
                    try {
                      await operation.run(() =>
                        authorClient.command(
                          `works/${detail.id}`,
                          { requestId: requestIdentity() },
                          "DELETE",
                        ),
                      );
                      author.mutate();
                      refresh();
                    } catch (e) {
                      if (!operation.current()) return;
                      author.notify(
                        e instanceof Error ? e.message : "删除未完成",
                      );
                    }
                  }}
                >
                  删除作品
                </button>
              </>
            )}
        </div>
      )}
      {(detail.contentType !== "work" || detail.available) && (
        <ContentActions target={target} title={detail.title} />
      )}{" "}
      {editing && (
        <WorkEditor
          work={editing}
          onClose={() => {
            setEditing(null);
            if (needsRefresh.current) {
              needsRefresh.current = false;
              refresh();
            }
          }}
          onSaved={() => {
            needsRefresh.current = true;
          }}
        />
      )}
    </div>
  );
};
