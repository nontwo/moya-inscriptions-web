"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthorProfile } from "@moya/contracts";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import { authorClient, AuthorRequestError } from "./author-data";
import { AuthorDialog } from "./author-dialog";
import { requestIdentity } from "../shell/request-identity";
import { useAuthorOperation } from "./use-author-operation";
import { useAuthors } from "./author-context";
import { readAvatarImage, exportAvatar } from "./avatar-image";
import type { AvatarImage } from "./avatar-image";
import styles from "./avatar-editor.module.css";
const pngFile = async (file: File): Promise<HTMLImageElement> => {
  if (file.type !== "image/png" || file.size > 4 * 1024 * 1024)
    throw Error("请选择不超过 4 MiB 的 PNG 图像");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (img.naturalWidth > 8192 || img.naturalHeight > 8192)
      throw Error("图像宽高不能超过 8192 像素");
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const availableAt = (next: string | null) =>
  next ? new Date(next).getTime() : 0;
const newYorkTime = (next: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(next));

/** The device picker runs directly from the owner's click, before opening a modal. */
export const AvatarEntry = ({
  profile,
  className,
  children,
  onSaved,
}: {
  profile: AuthorProfile;
  className: string | undefined;
  children: ReactNode;
  onSaved: () => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const author = useAuthors();
  if (!profile.isOwner || author.viewer?.id !== profile.id)
    return <div className={className}>{children}</div>;
  return (
    <>
      <button
        type="button"
        className={`${className} ${styles.entry}`}
        aria-label="更换头像"
        onClick={() =>
          availableAt(profile.nextAvatarChangeAt) > Date.now()
            ? setOpen(true)
            : input.current?.click()
        }
      >
        {children}
        <span className={styles.entryLabel}>更换头像</span>
      </button>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label="选择头像照片"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          event.target.value = "";
          if (selected) {
            setFile(selected);
            setOpen(true);
          }
        }}
      />
      {open && (
        <AvatarEditor
          profile={profile}
          file={file}
          onSaved={onSaved}
          onClose={() => {
            setOpen(false);
            setFile(null);
          }}
        />
      )}
    </>
  );
};

export const AvatarEditor = ({
  profile,
  file: initialFile = null,
  onClose,
  onSaved,
}: {
  profile: AuthorProfile;
  file?: File | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [file, setFile] = useState(initialFile);
  const [source, setSource] = useState<AvatarImage | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [decoding, setDecoding] = useState(false);
  const ownedSource = useRef<AvatarImage | null>(null);
  const [next, setNext] = useState(profile.nextAvatarChangeAt);
  const [now, setNow] = useState(Date.now);
  const input = useRef<HTMLInputElement>(null);
  const cropArea = useRef<Area | null>(null);
  const saving = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (ownedSource.current) URL.revokeObjectURL(ownedSource.current.url);
    };
  }, []);
  const pending = useRef<{
    blob: Blob;
    uploadId: string;
    saveId: string;
    mediaId?: string;
  } | null>(null);
  const operation = useAuthorOperation(),
    author = useAuthors();
  const limited = availableAt(next) > now;
  useEffect(() => {
    if (!limited) return;
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      Math.min(availableAt(next) - Date.now() + 10, 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [next, limited]);
  useEffect(() => {
    let active = true;
    if (!file) return;
    setDecoding(true);
    setError("");
    void readAvatarImage(file)
      .then((value) => {
        if (!active) {
          URL.revokeObjectURL(value.url);
          return;
        }
        if (ownedSource.current) URL.revokeObjectURL(ownedSource.current.url);
        ownedSource.current = value;
        cropArea.current = null;
        pending.current = null;
        setReady(false);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setSource(value);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "图像无法打开，请重新选择");
      })
      .finally(() => {
        if (active) setDecoding(false);
      });
    return () => {
      active = false;
    };
  }, [file]);
  const save = async () => {
    if (saving.current || decoding || limited || !source || !cropArea.current)
      return;
    saving.current = true;
    setBusy(true);
    setError("");
    const selected = { ...cropArea.current };
    try {
      const blob =
        pending.current?.blob ??
        (await operation.run(() => exportAvatar(source.image, selected)));
      const command = pending.current ?? {
        blob,
        uploadId: requestIdentity(),
        saveId: requestIdentity(),
      };
      pending.current = command;
      if (!command.mediaId)
        command.mediaId = (
          await operation.run(() => authorClient.upload(blob, command.uploadId))
        ).id;
      await operation.run(() =>
        authorClient.avatar({
          requestId: command.saveId,
          mediaId: command.mediaId,
        }),
      );
      pending.current = null;
      onSaved();
      author.mutate();
      author.notify("头像已更换");
      onClose();
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "头像未更换，请重试");
      if (e instanceof AuthorRequestError && e.status === 409) {
        try {
          const current = await operation.run(() =>
            authorClient.profile(profile.id),
          );
          setNext(current.nextAvatarChangeAt);
          setNow(Date.now());
          if (availableAt(current.nextAvatarChangeAt) > Date.now())
            setError("今天已更换过头像，当前裁剪已保留。");
        } catch {
          /* Keep the original failure and the retryable crop. */
        }
      }
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <AuthorDialog
      title="更换头像"
      dirty={source !== null}
      dismissible={!busy}
      onClose={onClose}
    >
      <div className={styles.editor} aria-busy={busy}>
        {source && (
          <div
            className={styles.viewport}
            data-avatar-crop=""
            data-saving={busy}
          >
            <Cropper
              key={source.url}
              image={source.url}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              objectFit="cover"
              minZoom={1}
              maxZoom={3}
              disableAutomaticStylesInjection
              classes={{ cropAreaClassName: styles.mask ?? "" }}
              cropperProps={{
                tabIndex: busy ? -1 : 0,
                "aria-label": "拖动照片调整头像，可用方向键移动",
              }}
              mediaProps={{ alt: "待裁剪的头像照片" }}
              onCropChange={(value) => {
                if (!saving.current) setCrop(value);
              }}
              onZoomChange={(value) => {
                if (!saving.current) setZoom(value);
              }}
              onTouchRequest={() => !saving.current}
              onWheelRequest={() => !saving.current}
              onCropAreaChange={(_, area) => {
                if (saving.current) return;
                if (JSON.stringify(cropArea.current) !== JSON.stringify(area))
                  pending.current = null;
                cropArea.current = area;
                setReady(true);
              }}
            />
          </div>
        )}
        <p className="phase4-muted">
          {source
            ? "拖动照片调整位置，双指或滚轮缩放。"
            : file && !error
              ? "正在打开照片…"
              : "选择照片，调整你的头像。"}
        </p>
        {source && (
          <label className={styles.zoom}>
            缩放
            <input
              aria-label="缩放"
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={busy}
              onChange={(event) => {
                if (!saving.current) setZoom(Number(event.target.value));
              }}
            />
          </label>
        )}
        <p className="phase4-muted">
          {limited && next
            ? `今天已更换过头像。下次可更换：${newYorkTime(next)}（美国纽约时间）。`
            : "每天可更换一次头像，以美国纽约日期为准。"}
        </p>
        <input
          hidden
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="重新选择头像照片"
          disabled={busy || limited}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected && !saving.current) setFile(selected);
          }}
        />
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="button"
            className="phase4-button"
            disabled={busy || limited}
            onClick={() => input.current?.click()}
          >
            重新选择
          </button>
          <button
            type="button"
            className={`phase4-button ${styles.save}`}
            disabled={!ready || decoding || busy || limited}
            onClick={() => void save()}
          >
            {busy ? "正在保存…" : "保存头像"}
          </button>
        </div>
      </div>
    </AuthorDialog>
  );
};
export { pngFile };
