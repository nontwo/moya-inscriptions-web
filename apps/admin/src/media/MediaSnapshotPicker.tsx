"use client";

import { useState } from "react";
import {
  Button,
  useConfig,
  useDocumentDrawer,
  useDocumentInfo,
  useField,
  useForm,
  useFormFields,
  useListDrawer,
} from "@payloadcms/ui";
import type { FormState, UIFieldClientComponent } from "payload";
import type { EditorialMedia } from "@moya/contracts/internal/editorial";
import { selectedMediaSnapshot } from "./snapshot";

export const MediaSnapshotPicker: UIFieldClientComponent = () => {
  const { config } = useConfig();
  const { id: catalogDocumentId } = useDocumentInfo();
  const { value: catalogId } = useField<string>({ path: "catalogId" });
  const { addFieldRow, getDataByPath, getFields, dispatchFields, setModified } =
    useForm();
  const mediaRows = useFormFields(([fields]) => fields.media?.rows);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ListDrawer, , { openDrawer: openList, closeDrawer: closeList }] =
    useListDrawer({
      collectionSlugs: ["media"],
      selectedCollection: "media",
      uploads: true,
      filterOptions: {
        media: catalogId ? { catalogId: { equals: catalogId } } : false,
      },
    });
  const [UploadDrawer, , { openDrawer: openUpload, closeDrawer: closeUpload }] =
    useDocumentDrawer({ collectionSlug: "media" });

  const attach = (document: Record<string, unknown>) => {
    const existing =
      getDataByPath<Partial<EditorialMedia>[] | undefined>("media") ?? [];
    const snapshot = selectedMediaSnapshot(document, catalogId, existing);
    if (!snapshot) {
      setMessage("这张图片已在当前草稿中。");
      return;
    }
    const subFieldState: FormState = Object.fromEntries(
      Object.entries(snapshot).map(([key, value]) => [
        key,
        { value, initialValue: value, valid: true },
      ]),
    );
    addFieldRow({ path: "media", schemaPath: "catalogs.media", subFieldState });
    setMessage(
      snapshot.orderConfidence === "LOW"
        ? "已添加图片。排序可信度仍为低，请保留不确定性并核对顺序。保存草稿后生效。"
        : "已添加图片。可在下方原生图片行中调整顺序和代表图，保存草稿后生效。",
    );
  };

  const selectExisting = async (id: unknown) => {
    if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || busy) return;
    setBusy(true);
    try {
      const response = await fetch(
        `${config.routes.api}/media/${String(id)}?depth=0`,
        {
          credentials: "include",
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok) throw new Error("MEDIA_UNAVAILABLE");
      const document: unknown = await response.json();
      if (!document || typeof document !== "object" || Array.isArray(document))
        throw new Error("MEDIA_UNAVAILABLE");
      attach(document as Record<string, unknown>);
      closeList();
    } catch {
      setMessage("未能添加图片。请核对媒体所属目录及必填资料后重试。");
    } finally {
      setBusy(false);
    }
  };

  const synchronizeOrder = () => {
    const values =
      getDataByPath<Partial<EditorialMedia>[] | undefined>("media") ?? [];
    const current = getFields();
    const formState: FormState = {};
    values.forEach((_item, index) => {
      const path = `media.${index}.position`;
      formState[path] = { ...current[path], value: index, valid: true };
    });
    dispatchFields({ type: "UPDATE_MANY", formState });
    setModified(true);
    setMessage(
      "已按当前图片行顺序更新序号；原图、权利说明和排序可信度保持原值。保存草稿后生效。",
    );
  };

  return (
    <div className="field-type ui" data-editorial-media-picker="">
      <p>
        使用原生媒体库选择图片，或在原生上传表单中添加原图。所属目录和图片身份自动带入。
      </p>
      {!catalogDocumentId && <p>请先保存草稿，再添加图片。</p>}
      <Button
        type="button"
        buttonStyle="secondary"
        disabled={!catalogId || !catalogDocumentId || busy}
        onClick={openList}
      >
        从媒体库添加
      </Button>
      <Button
        type="button"
        buttonStyle="secondary"
        disabled={!catalogId || !catalogDocumentId || busy}
        onClick={openUpload}
      >
        上传原图并添加
      </Button>
      <Button
        type="button"
        buttonStyle="secondary"
        disabled={!mediaRows?.length || busy}
        onClick={synchronizeOrder}
      >
        同步当前行顺序
      </Button>
      <p>
        拖动下方原生图片行后，点击“同步当前行顺序”。权利说明和低可信度标记会随草稿版本保存。
      </p>
      {message && <p role="status">{message}</p>}
      <ListDrawer
        allowCreate={false}
        enableRowSelections={false}
        onSelect={({ doc }) => {
          void selectExisting(doc.id);
        }}
      />
      <UploadDrawer
        initialData={{ catalogId, origin: "upload" }}
        onSave={({ doc }) => {
          try {
            attach(doc);
            closeUpload();
          } catch {
            setMessage(
              "原图已保存到媒体库，但未能关联当前草稿。请核对媒体资料后从媒体库重选。",
            );
          }
        }}
      />
    </div>
  );
};
