"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { WorkVisibility } from "@moya/contracts";
import { toWorkMediaPresentation } from "../detail/catalog-detail-presentation";
import { useCatalogDetailWithdrawal } from "../detail/catalog-detail-withdrawal";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import detailStyles from "../detail/catalog-detail.module.css";
import {
  publishingClient,
  PublishingRequestError,
} from "../publishing/publishing-data";
import { usePublishingEntry } from "../publishing/publishing-entry";
import { requestIdentity } from "../shell/request-identity";
import { authorClient, AuthorRequestError } from "./author-data";
import { AuthorDialog } from "./author-dialog";
import { useAuthors } from "./author-context";
import { ContentActions } from "./content-actions";
import { UNTITLED_WORK_LABEL } from "./content-card";
import { useProductShell } from "../product-shell/product-shell";
import { recordLocalHistory } from "./local-library";
export const loadWorkDetail: CatalogDetailPresentationLoader = async (
  id,
  signal,
) => {
  try {
    const work = await authorClient.work(id, signal);
    const label = work.title === "" ? UNTITLED_WORK_LABEL : work.title;
    return {
      state: "loaded",
      detail: {
        contentType: "work",
        id: work.id,
        authorId: work.authorId,
        authorName: work.authorName,
        canEdit: work.canEdit,
        available: work.available,
        firstPublishedAt: work.firstPublishedAt,
        editedAt: work.editedAt ?? null,
        ...(work.visibility === undefined
          ? {}
          : { visibility: work.visibility }),
        title: work.title,
        aliases: [],
        facts: [],
        sections: work.text
          ? [{ key: "description", title: "正文", text: work.text }]
          : [],
        media: work.media.map((m) => toWorkMediaPresentation(m, label)),
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

type WorkDetail = Extract<CatalogDetailPresentation, { contentType: "work" }>;

type ManagementIntent =
  | { readonly kind: "visibility"; readonly visibility: WorkVisibility }
  | { readonly kind: "trash" };

interface PendingIntent {
  readonly intent: ManagementIntent;
  /** Reused when a result was not confirmed: commands are idempotent per request. */
  readonly requestId: string;
}

const visibilityName = (visibility: WorkVisibility) =>
  visibility === "self" ? "仅自己可见" : "公开";

/**
 * States only what the answer confirms: the requested visibility as changed,
 * or, when the answer differs from the request, the visibility as it is.
 */
const visibilityResultText = (
  requested: WorkVisibility,
  answered: WorkVisibility,
) =>
  requested === answered
    ? `可见范围已改为${visibilityName(answered)}`
    : `可见范围：${visibilityName(answered)}`;

const TRASHED_TEXT = "作品已移到回收站";

const TRASHED_NOTICE = {
  title: TRASHED_TEXT,
  description: "保留期内可以在回收站中恢复，恢复后为仅自己可见。",
} as const;

/**
 * The author's own controls on a work (§11 item 11): edit, the requested
 * visibility and moving to the recycle bin. Wording states what was changed,
 * never a delivery or review state. Busy controls stay focusable
 * (aria-disabled), so a result never leaves the focus behind.
 */
const WorkManagement = ({
  detail,
  onTrashed,
  onVisibility,
  trashed,
  visibility,
}: {
  detail: WorkDetail;
  onTrashed: () => void;
  onVisibility: (visibility: WorkVisibility) => void;
  /** Without a Detail that can withdraw its content, only the result stays. */
  trashed: boolean;
  visibility: WorkVisibility | undefined;
}) => {
  const author = useAuthors();
  const { openEditor } = usePublishingEntry();
  const withdraw = useCatalogDetailWithdrawal();
  const [confirm, setConfirm] = useState<"private" | "trash" | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    readonly tone: "status" | "error";
    readonly text: string;
  } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<PendingIntent | null>(null);
  const privateRef = useRef<HTMLButtonElement>(null);
  const trashRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const busyRef = useRef(false);
  const visibilityLabel = useId();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // After a result, a control that disappeared with it (e.g. 重试) hands
  // the focus to the result line.
  const refocusRef = useRef(false);
  useLayoutEffect(() => {
    if (busy || !refocusRef.current) return;
    refocusRef.current = false;
    const focused = document.activeElement;
    if (focused === null || focused === document.body || !focused.isConnected)
      statusRef.current?.focus();
  }, [busy, message, trashed, unconfirmed]);

  const run = async (pending: PendingIntent) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    // 重试 stays (unavailable) while its own request runs; another command drops it.
    if (pending !== unconfirmed) setUnconfirmed(null);
    const { intent, requestId } = pending;
    try {
      if (intent.kind === "trash") {
        await publishingClient.trashWork(detail.id, { requestId });
        if (!mounted.current) return;
        setUnconfirmed(null);
        author.mutate();
        if (withdraw !== null) {
          // The Detail replaces media, actions and discussion with the result.
          withdraw(detail.id, TRASHED_NOTICE);
          return;
        }
        setMessage({ tone: "status", text: TRASHED_TEXT });
        // The controls are gone; the result line takes the focus.
        onTrashed();
        return;
      }
      const result = await publishingClient.setVisibility(detail.id, {
        requestId,
        visibility: intent.visibility,
      });
      if (!mounted.current) return;
      // The answer, not the request, decides what is shown.
      onVisibility(result.visibility);
      setUnconfirmed(null);
      setMessage({
        tone: "status",
        text: visibilityResultText(intent.visibility, result.visibility),
      });
      author.mutate();
    } catch (error) {
      if (!mounted.current) return;
      const unknown =
        error instanceof PublishingRequestError && error.outcomeUnknown;
      setUnconfirmed(unknown ? pending : null);
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "暂时无法完成，请重试",
      });
    } finally {
      busyRef.current = false;
      if (mounted.current) {
        refocusRef.current = true;
        setBusy(false);
      }
    }
  };

  const start = (intent: ManagementIntent) =>
    void run({ intent, requestId: requestIdentity() });

  const closeConfirm = (opener: HTMLButtonElement | null) => {
    setConfirm(null);
    window.requestAnimationFrame(() => {
      if (opener?.isConnected) opener.focus();
    });
  };

  const unavailable = busy ? true : undefined;

  return (
    <section
      aria-label="作品管理"
      className={detailStyles.workManagement}
      data-work-management=""
    >
      {trashed ? null : (
        <div className={detailStyles.workManagementRow}>
          <button
            aria-disabled={unavailable}
            onClick={(event) => {
              if (!busyRef.current)
                openEditor(
                  { type: "work", id: detail.id },
                  event.currentTarget,
                );
            }}
            type="button"
          >
            编辑
          </button>
          {visibility === undefined ? null : (
            <div
              aria-labelledby={visibilityLabel}
              className={detailStyles.visibilitySwitch}
              data-work-visibility={visibility}
              role="group"
            >
              <span
                className={detailStyles.workManagementLabel}
                id={visibilityLabel}
              >
                可见范围
              </span>
              <button
                aria-disabled={unavailable}
                aria-pressed={visibility === "public"}
                onClick={() => {
                  if (!busyRef.current && visibility !== "public")
                    start({ kind: "visibility", visibility: "public" });
                }}
                type="button"
              >
                公开
              </button>
              <button
                aria-disabled={unavailable}
                aria-pressed={visibility === "self"}
                onClick={() => {
                  if (!busyRef.current && visibility !== "self")
                    setConfirm("private");
                }}
                ref={privateRef}
                type="button"
              >
                仅自己可见
              </button>
            </div>
          )}
          <button
            aria-disabled={unavailable}
            onClick={() => {
              if (!busyRef.current) setConfirm("trash");
            }}
            ref={trashRef}
            type="button"
          >
            移到回收站
          </button>
        </div>
      )}
      <p
        aria-live="polite"
        className={detailStyles.workManagementStatus}
        data-tone={message?.tone}
        data-work-management-status=""
        ref={statusRef}
        role="status"
        tabIndex={-1}
      >
        {message?.text}
      </p>
      {unconfirmed !== null &&
      !trashed &&
      (busy || message?.tone === "error") ? (
        <div className={detailStyles.workManagementRow}>
          <button
            aria-disabled={unavailable}
            onClick={() => void run(unconfirmed)}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}
      {confirm === "private" ? (
        <AuthorDialog
          onClose={() => closeConfirm(privateRef.current)}
          title="设为仅自己可见"
        >
          <p className="phase4-muted">
            设为仅自己可见后，其他人将无法打开这件作品，也无法查看或参与它的评论。作品内容、评论、喜欢和收藏都会保留，之后可以随时改回公开，改回时按当前的作品发布规则处理。
          </p>
          <div className="phase4-actions">
            <button
              data-confirm-private=""
              onClick={() => {
                closeConfirm(privateRef.current);
                start({ kind: "visibility", visibility: "self" });
              }}
              type="button"
            >
              设为仅自己可见
            </button>
            <button
              onClick={() => closeConfirm(privateRef.current)}
              type="button"
            >
              取消
            </button>
          </div>
        </AuthorDialog>
      ) : null}
      {confirm === "trash" ? (
        <AuthorDialog
          onClose={() => closeConfirm(trashRef.current)}
          title="移到回收站"
        >
          <p className="phase4-muted">
            作品将移到回收站，其他人将无法打开它。保留期内可以在回收站中恢复，恢复后为仅自己可见。
          </p>
          <div className="phase4-actions">
            <button
              data-confirm-trash=""
              onClick={() => {
                closeConfirm(trashRef.current);
                start({ kind: "trash" });
              }}
              type="button"
            >
              移到回收站
            </button>
            <button
              onClick={() => closeConfirm(trashRef.current)}
              type="button"
            >
              取消
            </button>
          </div>
        </AuthorDialog>
      ) : null}
    </section>
  );
};

export const DetailActions = ({
  detail,
}: {
  detail: CatalogDetailPresentation;
}) => {
  const author = useAuthors(),
    shell = useProductShell();
  const [trashedId, setTrashedId] = useState<string | null>(null);
  const [visibilityChange, setVisibilityChange] = useState<{
    readonly id: string;
    readonly value: WorkVisibility;
  } | null>(null);
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
  if (detail.contentType !== "work")
    return (
      <div>
        <ContentActions target={target} title={detail.title} />{" "}
      </div>
    );
  // Only the confirmed author sees management; a third party never does.
  const owner =
    detail.canEdit &&
    author.viewer !== null &&
    author.viewer.id === detail.authorId;
  const trashed = trashedId === detail.id;
  const changedVisibility =
    visibilityChange?.id === detail.id ? visibilityChange.value : null;
  // `available` lets the author open their own self-only or not yet public
  // work, so it is never labelled; a note appears only when the work is not
  // shown to others for another reason (e.g. hidden by an operator).
  const notice = detail.available
    ? null
    : owner
      ? "此作品当前不对其他人显示。"
      : "此作品当前不可公开访问。";
  // Likes, favorites and sharing are public interactions: for the author
  // they are offered only while the loaded work is public to others. After a
  // visibility change here that is known again only when the work reloads.
  const interactive =
    detail.available &&
    !trashed &&
    (!owner ||
      (changedVisibility === null &&
        detail.visibility === "public" &&
        detail.firstPublishedAt !== null &&
        detail.firstPublishedAt !== undefined));
  return (
    <div>
      <div className="phase4-actions">
        <button
          type="button"
          onClick={(e) => shell.openProfile(detail.authorId, e.currentTarget)}
        >
          {detail.authorName}
        </button>
        {notice === null ? null : <p data-work-notice="">{notice}</p>}
      </div>
      {owner ? (
        <WorkManagement
          detail={detail}
          onTrashed={() => setTrashedId(detail.id)}
          onVisibility={(value) =>
            setVisibilityChange({ id: detail.id, value })
          }
          trashed={trashed}
          visibility={changedVisibility ?? detail.visibility}
        />
      ) : null}
      {interactive && (
        <ContentActions
          target={target}
          title={detail.title === "" ? UNTITLED_WORK_LABEL : detail.title}
        />
      )}{" "}
    </div>
  );
};
