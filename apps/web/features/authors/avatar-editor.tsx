"use client";
import { useEffect, useRef, useState } from "react";
import type { AuthorProfile } from "@moya/contracts";
import { authorClient } from "./author-data";
import { AuthorDialog } from "./author-dialog";
import { requestIdentity } from "../shell/request-identity";
import { useAuthorOperation } from "./use-author-operation";
import { useAuthors } from "./author-context";
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
export const AvatarEditor = ({
  profile,
  onClose,
  onSaved,
}: {
  profile: AuthorProfile;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const canvas = useRef<HTMLCanvasElement>(null),
    [source, setSource] = useState<HTMLImageElement | null>(null),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [next, setNext] = useState(profile.nextAvatarChangeAt);
  const author = useAuthors();
  const operation = useAuthorOperation();
  const pending = useRef<{
    blob: Blob;
    uploadId: string;
    saveId: string;
    mediaId?: string;
  } | null>(null);
  useEffect(() => {
    if (!source || !canvas.current) return;
    const context = canvas.current.getContext("2d");
    if (!context) return;
    const size = Math.min(source.naturalWidth, source.naturalHeight) / zoom;
    context.clearRect(0, 0, 512, 512);
    context.drawImage(
      source,
      ((source.naturalWidth - size) * x) / 100,
      ((source.naturalHeight - size) * y) / 100,
      size,
      size,
      0,
      0,
      512,
      512,
    );
  }, [source, zoom, x, y]);
  return (
    <AuthorDialog title="更换头像" dirty={source !== null} onClose={onClose}>
      <div className="phase4-form">
        <p>上传 PNG 后裁剪为方形。每个纽约日历日可成功更换一次。</p>
        {next && (
          <p role="status">
            下次允许更换：
            {new Date(next).toLocaleString("zh-CN", {
              timeZone: "America/New_York",
            })}
            （纽约时间）
          </p>
        )}
        <label>
          选择头像
          <input
            type="file"
            accept="image/png"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setError("");
              try {
                setSource(await operation.run(() => pngFile(file)));
                pending.current = null;
                setZoom(1);
                setX(50);
                setY(50);
              } catch (e) {
                setError(e instanceof Error ? e.message : "无法读取图像");
              }
            }}
          />
        </label>
        <canvas
          ref={canvas}
          width={512}
          height={512}
          className="phase4-crop"
          aria-label="头像裁剪预览"
        />
        {source && (
          <>
            <label>
              缩放
              <input
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                disabled={busy}
                onChange={(e) => {
                  pending.current = null;
                  setZoom(Number(e.target.value));
                }}
              />
            </label>
            <label>
              水平位置
              <input
                type="range"
                min={0}
                max={100}
                value={x}
                disabled={busy}
                onChange={(e) => {
                  pending.current = null;
                  setX(Number(e.target.value));
                }}
              />
            </label>
            <label>
              垂直位置
              <input
                type="range"
                min={0}
                max={100}
                value={y}
                disabled={busy}
                onChange={(e) => {
                  pending.current = null;
                  setY(Number(e.target.value));
                }}
              />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="phase4-button"
          disabled={!source || busy}
          onClick={async () => {
            if (!canvas.current || busy) return;
            setBusy(true);
            setError("");
            try {
              const blob =
                pending.current?.blob ??
                (await operation.run(
                  () =>
                    new Promise<Blob>((resolve, reject) =>
                      canvas.current!.toBlob(
                        (b) => (b ? resolve(b) : reject(Error("无法生成图像"))),
                        "image/png",
                      ),
                    ),
                ));
              const command = pending.current ?? {
                blob,
                uploadId: requestIdentity(),
                saveId: requestIdentity(),
              };
              pending.current = command;
              if (!command.mediaId)
                command.mediaId = (
                  await operation.run(() =>
                    authorClient.upload(blob, command.uploadId),
                  )
                ).id;
              const result = await operation.run(() =>
                authorClient.avatar({
                  requestId: command.saveId,
                  mediaId: command.mediaId,
                }),
              );
              pending.current = null;
              setNext(result.nextChangeAt);
              setSource(null);
              onSaved();
              author.mutate();
              author.notify("头像已更换");
            } catch (e) {
              if (!operation.current()) return;
              setError(e instanceof Error ? e.message : "头像未更换");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存头像
        </button>
      </div>
    </AuthorDialog>
  );
};
export { pngFile };
