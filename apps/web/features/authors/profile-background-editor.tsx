"use client";
import { useEffect, useRef, useState } from "react";
import type { AuthorProfile } from "@moya/contracts";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { AuthorDialog } from "./author-dialog";
import { useAuthors } from "./author-context";
import { authorClient } from "./author-data";
import { readAvatarImage, normalizeAvatarPng } from "./avatar-image";
import type { AvatarImage } from "./avatar-image";
import { requestIdentity } from "../shell/request-identity";

/** Reuse the image decoder and PNG sanitizer, exporting a bounded wide crop. */
export const exportProfileBackground = (
  image: HTMLImageElement,
  area: Area,
): Blob => {
  const { x, y, width, height } = area;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > image.naturalWidth ||
    y + height > image.naturalHeight
  )
    throw Error("裁剪区域尚未就绪，请重试");
  const canvas = document.createElement("canvas");
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext("2d", { colorSpace: "srgb" });
  if (!context) throw Error("当前浏览器无法导出图像");
  context.drawImage(image, x, y, width, height, 0, 0, 1280, 720);
  const data = canvas.toDataURL("image/png");
  if (!data.startsWith("data:image/png;base64,"))
    throw Error("图像导出失败，请重试");
  const bytes = normalizeAvatarPng(
    Uint8Array.from(atob(data.slice("data:image/png;base64,".length)), (char) =>
      char.charCodeAt(0),
    ),
  );
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "image/png" });
};

export const ProfileBackgroundEditor = ({
  profile,
  onClose,
  onSaved,
}: {
  profile: AuthorProfile;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const author = useAuthors();
  const [source, setSource] = useState<AvatarImage | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [blank, setBlank] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const area = useRef<Area | null>(null),
    owned = useRef<AvatarImage | null>(null),
    input = useRef<HTMLInputElement>(null),
    mounted = useRef(false),
    generation = useRef(0),
    saving = useRef(false);
  const intent = useRef<{
    uploadId: string;
    saveId: string;
    blob: Blob | null;
    mediaId?: string | null;
  } | null>(null);
  const allowed =
    profile.isOwner &&
    author.viewer?.id === profile.id &&
    !author.checking &&
    !author.sessionError;
  const latest = useRef({ allowed, account: author.viewer?.id });
  latest.current = { allowed, account: author.viewer?.id };
  const dirty = !saved && (source !== null || blank);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      if (owned.current) URL.revokeObjectURL(owned.current.url);
    };
  }, []);
  const select = async (file: File) => {
    const run = ++generation.current;
    setDecoding(true);
    setError("");
    try {
      const value = await readAvatarImage(file);
      if (!mounted.current || run !== generation.current) {
        URL.revokeObjectURL(value.url);
        return;
      }
      if (owned.current) URL.revokeObjectURL(owned.current.url);
      owned.current = value;
      area.current = null;
      intent.current = null;
      setReady(false);
      setBlank(false);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setSource(value);
    } catch (e) {
      if (mounted.current && run === generation.current)
        setError(e instanceof Error ? e.message : "图像无法打开，请重新选择");
    } finally {
      if (mounted.current && run === generation.current) setDecoding(false);
    }
  };
  const save = async () => {
    if (
      !latest.current.allowed ||
      saving.current ||
      decoding ||
      !dirty ||
      (!blank && (!source || !area.current))
    )
      return;
    const accountRun = authorClient.accountEpoch();
    const current = () =>
      mounted.current &&
      latest.current.allowed &&
      latest.current.account === profile.id &&
      authorClient.accountEpoch() === accountRun;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const pending = intent.current ?? {
        uploadId: requestIdentity(),
        saveId: requestIdentity(),
        blob: blank
          ? null
          : exportProfileBackground(source!.image, area.current!),
        ...(blank ? { mediaId: null } : {}),
      };
      intent.current = pending;
      if (pending.mediaId === undefined) {
        const media = await authorClient.upload(
          pending.blob!,
          pending.uploadId,
        );
        if (!current()) return;
        pending.mediaId = media.id;
      }
      if (!current()) return;
      await authorClient.background({
        requestId: pending.saveId,
        mediaId: pending.mediaId,
      });
      if (!current()) return;
      setSaved(true);
      onSaved();
      author.mutate();
      author.notify(blank ? "主页背景已清除" : "主页背景已保存");
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "背景保存失败，请重试");
    } finally {
      saving.current = false;
      if (mounted.current) {
        setBusy(false);
        if (!current()) setError("账户状态已变化，请确认账户后重试保存");
      }
    }
  };
  return (
    <AuthorDialog
      title="主页背景"
      dirty={dirty}
      dismissible={!busy}
      closeRequested={saved}
      onClose={onClose}
    >
      <div className="phase4-background-editor" aria-busy={busy || decoding}>
        {source && !blank ? (
          <>
            <div className="phase4-background-crop">
              <Cropper
                image={source.url}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                objectFit="cover"
                minZoom={1}
                maxZoom={3}
                showGrid={false}
                disableAutomaticStylesInjection
                cropperProps={{
                  tabIndex: busy ? -1 : 0,
                  "aria-label": "拖动照片调整主页背景，可用方向键移动",
                }}
                mediaProps={{ alt: "待裁剪的主页背景" }}
                onCropChange={(value) => {
                  if (!saving.current) {
                    setCrop(value);
                    intent.current = null;
                  }
                }}
                onZoomChange={(value) => {
                  if (!saving.current) {
                    setZoom(value);
                    intent.current = null;
                  }
                }}
                onTouchRequest={() => !saving.current}
                onWheelRequest={() => !saving.current}
                onCropAreaChange={(_, value) => {
                  if (!saving.current) {
                    area.current = value;
                    setReady(true);
                  }
                }}
              />
            </div>
            <label>
              缩放
              <input
                aria-label="背景缩放"
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={zoom}
                disabled={busy || decoding}
                onChange={(event) => {
                  setZoom(Number(event.target.value));
                  intent.current = null;
                }}
              />
            </label>
          </>
        ) : (
          <div
            className="phase4-background-preview"
            aria-label={
              blank || !profile.background ? "空白主页背景" : "当前主页背景"
            }
          >
            {!blank && profile.background && (
              <img src={profile.background.src} alt="当前主页背景" />
            )}
          </div>
        )}
        <p className="phase4-muted">
          选择照片后拖动、缩放调整背景，点击保存后生效。
        </p>
        <input
          ref={input}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="选择主页背景照片"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void select(file);
          }}
        />
        <div className="phase4-actions">
          <button
            type="button"
            disabled={!allowed || busy || decoding}
            onClick={() => input.current?.click()}
          >
            选择照片
          </button>
          {(profile.background || source) && (
            <button
              type="button"
              disabled={!allowed || busy || decoding}
              onClick={() => {
                setBlank(true);
                intent.current = null;
              }}
            >
              恢复空白背景
            </button>
          )}
          <button
            type="button"
            disabled={
              !allowed || busy || decoding || !dirty || (!blank && !ready)
            }
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存背景"}
          </button>
        </div>
        {decoding && <p role="status">正在打开照片…</p>}
        {!allowed && <p role="status">正在确认账户，确认后可编辑背景。</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </AuthorDialog>
  );
};
