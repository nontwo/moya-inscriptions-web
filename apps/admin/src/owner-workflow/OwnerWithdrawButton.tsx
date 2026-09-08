"use client";

import { useRef, useState } from "react";
import {
  ConfirmationModal,
  PopupList,
  toast,
  useAuth,
  useConfig,
  useDocumentInfo,
  useForm,
  useFormBackgroundProcessing,
  useFormFields,
  useFormInitializing,
  useFormModified,
  useFormProcessing,
  useModal,
} from "@payloadcms/ui";

/** Native withdrawal with the same saved-revision check as every other write. */
export const OwnerWithdrawButton = () => {
  const { user } = useAuth();
  const { config } = useConfig();
  const {
    id,
    collectionSlug,
    currentEditor,
    data,
    disableActions,
    documentIsLocked,
    hasPublishedDoc,
    hasPublishPermission,
    isInitializing,
    isLocked,
    isTrashed,
  } = useDocumentInfo();
  const { getDataByPath, setProcessing } = useForm();
  const revision = useFormFields(([fields]) => fields.revision?.value);
  const modified = useFormModified();
  const processing = useFormProcessing();
  const backgroundProcessing = useFormBackgroundProcessing();
  const initializing = useFormInitializing();
  const { openModal } = useModal();
  const [reviewedRevision, setReviewedRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const inFlight = useRef(false);
  const modalSlug = `confirm-editorial-withdraw-${String(id)}`;
  const ownerCanWithdraw =
    user?.collection === "users" &&
    user.role === "owner" &&
    collectionSlug === "catalogs" &&
    id !== undefined &&
    hasPublishPermission &&
    hasPublishedDoc &&
    !isTrashed;
  const savedRevision =
    typeof revision === "number" &&
    Number.isSafeInteger(revision) &&
    revision > 0 &&
    revision === data?.revision
      ? revision
      : null;
  const currentEditorId =
    currentEditor && typeof currentEditor === "object"
      ? currentEditor.id
      : currentEditor;
  const lockedByAnotherEditor =
    (documentIsLocked || isLocked) &&
    String(currentEditorId) !== String(user?.id);
  const disabled =
    !ownerCanWithdraw ||
    savedRevision === null ||
    busy ||
    refreshRequired ||
    modified ||
    processing ||
    backgroundProcessing ||
    initializing ||
    isInitializing ||
    disableActions ||
    lockedByAnotherEditor;

  const withdraw = async () => {
    if (inFlight.current) return;
    // Confirmation remains bound to the revision the Owner saw when opening
    // the dialog. Never fetch a newer revision and silently retry a conflict.
    if (
      disabled ||
      reviewedRevision === null ||
      reviewedRevision !== savedRevision ||
      getDataByPath("revision") !== reviewedRevision
    ) {
      toast.error("内容或保存状态已变化。请等待保存完成，刷新后重新确认。");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setProcessing(true);
    try {
      const response = await fetch(
        `${config.routes.api}/catalogs/${encodeURIComponent(String(id))}?draft=false&depth=0`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            _status: "draft",
            revision: reviewedRevision,
          }),
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        },
      );
      // A refresh is required after every submitted request, including an
      // uncertain response. Reopening the dialog must not repeat the write.
      setRefreshRequired(true);
      if (response.ok) {
        // Payload's native PATCH endpoint returns { doc, message }. Consume
        // the complete response before navigation can cancel its body stream.
        const result: unknown = await response.json();
        const document =
          result && typeof result === "object" && "doc" in result
            ? result.doc
            : undefined;
        if (
          !document ||
          typeof document !== "object" ||
          !("id" in document) ||
          typeof document.id !== "number" ||
          !Number.isSafeInteger(document.id) ||
          String(document.id) !== String(id) ||
          !("_status" in document) ||
          document._status !== "draft" ||
          !("revision" in document) ||
          document.revision !== reviewedRevision + 1
        ) {
          throw new Error("WITHDRAWAL_RESULT_UNCONFIRMED");
        }
        window.location.reload();
      } else if (response.status === 409) {
        toast.error("记录已被修改或正在操作。请刷新并重新审核后再取消发布。");
      } else {
        toast.error("取消发布未完成。请刷新并核对当前状态后再操作。");
      }
    } catch {
      setRefreshRequired(true);
      toast.error("未能确认取消发布结果。请刷新并核对当前状态，不会自动重试。");
    } finally {
      inFlight.current = false;
      setBusy(false);
      setProcessing(false);
      setReviewedRevision(null);
    }
  };

  if (!ownerCanWithdraw) return null;
  return (
    <>
      <PopupList.Button
        id="action-unpublish"
        disabled={Boolean(disabled)}
        onClick={() => {
          if (disabled || savedRevision === null) return;
          setReviewedRevision(savedRevision);
          openModal(modalSlug);
        }}
      >
        取消发布
      </PopupList.Button>
      <ConfirmationModal
        modalSlug={modalSlug}
        heading="确认取消发布"
        body={`将取消当前资料的发布。已保存的草稿与历史版本会保留。当前已保存版本：${reviewedRevision ?? ""}。`}
        confirmLabel="确认取消发布"
        confirmingLabel="取消发布中…"
        onCancel={() => setReviewedRevision(null)}
        onConfirm={withdraw}
      />
    </>
  );
};
