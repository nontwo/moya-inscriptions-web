"use client";
import { useEffect, useRef, useState } from "react";
import type { AuthorMedia, UserWork, WorkEditDraft } from "@moya/contracts";
import { authorClient } from "./author-data";
import { AuthorDialog } from "./author-dialog";
import { useAuthors } from "./author-context";
import { requestIdentity } from "../shell/request-identity";
import { useAuthorOperation } from "./use-author-operation";
import { pngFile } from "./avatar-editor";
export const WorkEditor = ({
  work,
  onClose,
  onSaved,
}: {
  work: UserWork;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [title, setTitle] = useState(work.title),
    [text, setText] = useState(work.text),
    [media, setMedia] = useState<AuthorMedia[]>(work.media),
    [drafts, setDrafts] = useState<WorkEditDraft[]>([]),
    [currentVersion, setCurrentVersion] = useState(0),
    [baseWorkVersion, setBaseWorkVersion] = useState(work.version),
    [baseDraftVersion, setBaseDraftVersion] = useState(0),
    [selected, setSelected] = useState<WorkEditDraft | null>(null),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [latestPublished, setLatestPublished] = useState<UserWork | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("尚未保存为草稿");
  const initial = JSON.stringify({
      title: work.title,
      text: work.text,
      mediaIds: work.media.map((i) => i.id),
    }),
    saved = useRef(initial),
    revision = useRef(0);
  const author = useAuthors();
  const operation = useAuthorOperation();
  const content = {
      title: title.trim(),
      text: text.trim(),
      mediaIds: media.map((i) => i.id),
    },
    dirty = JSON.stringify(content) !== saved.current;
  const load = async (nextPage = 1) => {
    const result = await operation.run(() =>
      authorClient.drafts(work.id, nextPage),
    );
    setDrafts((old) =>
      nextPage === 1 ? result.items : [...old, ...result.items],
    );
    setCurrentVersion(result.currentVersion);
    setPage(nextPage);
    setTotal(result.total);
    return result;
  };
  useEffect(() => {
    let active = true;
    void authorClient
      .drafts(work.id)
      .then((r) => {
        if (!active) return;
        setDrafts(r.items);
        setCurrentVersion(r.currentVersion);
        setBaseDraftVersion(r.currentVersion);
        setTotal(r.total);
        setStatus(
          r.total
            ? "发现已保存版本，请选择继续编辑；当前显示已发布内容"
            : "当前显示已发布内容",
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [work.id]);
  const edit = () => {
    revision.current++;
    setSelected(null);
    setStatus("尚未保存");
  };
  const save = async () => {
    if (busy) return;
    const submitted = revision.current;
    setBusy(true);
    setError("");
    try {
      const result = await operation.run(() =>
        authorClient.saveDraft(work.id, {
          requestId: requestIdentity(),
          baseWorkVersion,
          baseDraftVersion,
          content,
        }),
      );
      await load();
      if (submitted === revision.current) {
        saved.current = JSON.stringify(content);
        setSelected(result.draft);
        setBaseDraftVersion(result.latestVersion);
        setStatus(
          result.conflict
            ? "已保留冲突版本，请检查所有版本再选择"
            : "草稿已保存到服务器",
        );
      } else setStatus("先前文本已保存，当前输入尚未保存");
    } catch (e) {
      if (!operation.current()) return;
      setError(e instanceof Error ? e.message : "保存失败，输入仍保留");
    } finally {
      setBusy(false);
    }
  };
  const select = async (draft: WorkEditDraft) => {
    if (dirty && !window.confirm("当前输入尚未保存，放弃后载入此版本？"))
      return;
    setTitle(draft.content.title);
    setText(draft.content.text);
    const mediaById = new Map([...work.media, ...media].map((m) => [m.id, m]));
    setMedia(
      draft.content.mediaIds.map(
        (id) =>
          mediaById.get(id) ?? {
            id,
            src: `/api/community/media/${id}`,
            width: 512,
            height: 512,
          },
      ),
    );
    setBaseWorkVersion(draft.baseWorkVersion);
    setBaseDraftVersion(currentVersion);
    setSelected(draft);
    saved.current = JSON.stringify(draft.content);
    revision.current++;
    setStatus("已载入服务器草稿；可编辑、保存新版本或应用此版本");
  };
  return (
    <AuthorDialog title="编辑现有作品" dirty={dirty} onClose={onClose}>
      <div className="phase4-form">
        <p className="phase4-muted">
          访客在更新保存前看到上一已发布版本。草稿会保留在账户中。
        </p>
        <label>
          标题
          <input
            value={title}
            maxLength={200}
            onChange={(e) => {
              edit();
              setTitle(e.target.value);
            }}
          />
        </label>
        <label>
          正文
          <textarea
            value={text}
            maxLength={10000}
            onChange={(e) => {
              edit();
              setText(e.target.value);
            }}
          />
        </label>
        <div className="phase4-media-editor">
          {media.map((item, index) => (
            <div key={item.id}>
              <img src={item.src} alt={`作品图像 ${index + 1}`} />
              <div className="phase4-actions">
                <button
                  disabled={busy || index === 0}
                  onClick={() => {
                    edit();
                    setMedia((old) => {
                      const next = [...old];
                      [next[index - 1], next[index]] = [
                        next[index]!,
                        next[index - 1]!,
                      ];
                      return next;
                    });
                  }}
                >
                  前移
                </button>
                <button
                  disabled={busy || index === media.length - 1}
                  onClick={() => {
                    edit();
                    setMedia((old) => {
                      const next = [...old];
                      [next[index], next[index + 1]] = [
                        next[index + 1]!,
                        next[index]!,
                      ];
                      return next;
                    });
                  }}
                >
                  后移
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    edit();
                    setMedia((old) => old.filter((m) => m.id !== item.id));
                  }}
                >
                  移除
                </button>
              </div>
            </div>
          ))}
        </div>
        <label>
          添加图像（PNG，最多 12 张，第一张为封面）
          <input
            type="file"
            accept="image/png"
            multiple
            disabled={busy || media.length >= 12}
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.length + media.length > 12) {
                setError("最多 12 张图像");
                return;
              }
              setBusy(true);
              setError("");
              try {
                for (const file of files) {
                  await operation.run(() => pngFile(file));
                  const item = await operation.run(() =>
                    authorClient.upload(file, requestIdentity()),
                  );
                  edit();
                  setMedia((old) => [...old, item]);
                }
              } catch (e) {
                if (!operation.current()) return;
                setError(e instanceof Error ? e.message : "上传失败");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        <p role="status">
          {status}
          {dirty ? " · 当前输入尚未保存" : ""}
        </p>
        {error && (
          <p role="alert" className="phase4-error">
            {error}
          </p>
        )}
        <div className="phase4-actions">
          <button disabled={busy || !title.trim()} onClick={() => void save()}>
            保存编辑草稿
          </button>
          <button
            disabled={busy || dirty || !selected || !work.available}
            onClick={async () => {
              if (!selected) return;
              setBusy(true);
              setError("");
              try {
                const result = await operation.run(() =>
                  authorClient.applyDraft(work.id, {
                    requestId: requestIdentity(),
                    draftId: selected.id,
                  }),
                );
                if (!result.applied) {
                  setStatus(
                    "作品版本已变化，草稿保留。请刷新已发布版本后合并，再保存新草稿",
                  );
                  return;
                }
                setBaseWorkVersion(result.workVersion);
                setSelected(null);
                await load();
                setStatus("更新已应用；其他草稿仍保留");
                onSaved();
                author.mutate();
              } catch (e) {
                if (!operation.current()) return;
                setError(e instanceof Error ? e.message : "更新未应用");
              } finally {
                setBusy(false);
              }
            }}
          >
            保存更新
          </button>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const latest = await operation.run(() =>
                  authorClient.work(work.id),
                );
                setLatestPublished(latest);
                await load();
                setStatus("已读取最新作品版本，请在下方对照合并");
              } catch (e) {
                if (!operation.current()) return;
                setError(e instanceof Error ? e.message : "读取失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            检查其他设备的版本
          </button>
        </div>
        {latestPublished && (
          <section aria-label="其他设备的已发布版本">
            <h3>最新已发布版本 {latestPublished.version}</h3>
            <h4>{latestPublished.title}</h4>
            <p style={{ whiteSpace: "pre-wrap" }}>{latestPublished.text}</p>
            <div className="phase4-media-editor">
              {latestPublished.media.map((m) => (
                <img key={m.id} src={m.src} alt="最新已发布图像" />
              ))}
            </div>
            <button
              className="phase4-button"
              disabled={busy}
              onClick={() => {
                setBaseWorkVersion(latestPublished.version);
                setBaseDraftVersion(currentVersion);
                setSelected(null);
                setStatus("已确认合并基础，请保存新草稿后检查再应用");
                setLatestPublished(null);
              }}
            >
              已对照并完成合并，以此版本为基础保存我的输入
            </button>
          </section>
        )}
        <section>
          <h3>可恢复的草稿版本</h3>
          {drafts.map((draft) => (
            <div key={draft.id}>
              <p>
                版本 {draft.version} ·{" "}
                {new Date(draft.savedAt).toLocaleString()}{" "}
                {draft.conflicted ? "· 存在并发冲突" : ""}
              </p>
              <p>{draft.content.title}</p>
              <div className="phase4-actions">
                <button disabled={busy} onClick={() => void select(draft)}>
                  载入版本 {draft.version}
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm(`确定丢弃草稿版本 ${draft.version}？`))
                      return;
                    setBusy(true);
                    try {
                      await operation.run(() =>
                        authorClient.command(
                          `works/${work.id}/drafts/${draft.id}`,
                          { requestId: requestIdentity() },
                          "DELETE",
                        ),
                      );
                      if (selected?.id === draft.id) setSelected(null);
                      await load();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "未丢弃");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  丢弃此版本
                </button>
              </div>
            </div>
          ))}
          {drafts.length < total && (
            <button
              onClick={() =>
                void load(page + 1).catch((e) => setError(e.message))
              }
            >
              加载更多版本
            </button>
          )}
        </section>
      </div>
    </AuthorDialog>
  );
};
