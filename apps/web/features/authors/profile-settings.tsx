"use client";
import { useEffect, useState } from "react";
import type { AuthorProfile } from "@moya/contracts";
import { AuthorDialog } from "./author-dialog";
import { authorClient } from "./author-data";
import { useAuthors } from "./author-context";
import { requestIdentity } from "../shell/request-identity";
export const ProfileSettings = ({
  profile,
  onClose,
  onSaved,
}: {
  profile: AuthorProfile;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [privacy, setPrivacy] = useState(profile.privacy),
    [saved, setSaved] = useState(profile.privacy),
    [blocks, setBlocks] = useState<Awaited<
      ReturnType<typeof authorClient.people>
    > | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const author = useAuthors();
  const load = (page = 1) =>
    authorClient
      .people(profile.id, "blocks", page)
      .then((result) =>
        setBlocks((old) =>
          page === 1
            ? result
            : { ...result, items: [...(old?.items ?? []), ...result.items] },
        ),
      );
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [profile.id]);
  const labels = {
    following: "关注列表",
    followers: "粉丝列表",
    favorites: "收藏列表",
    likes: "喜欢列表",
  } as const;
  return (
    <AuthorDialog
      title="账户设置"
      dirty={JSON.stringify(saved) !== JSON.stringify(privacy)}
      onClose={onClose}
    >
      <div className="phase4-form">
        <h3>列表隐私</h3>
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <label key={key}>
            {labels[key]}
            <select
              value={privacy[key]}
              disabled={busy}
              onChange={(e) =>
                setPrivacy((old) => ({
                  ...old,
                  [key]: e.target.value as "public" | "private",
                }))
              }
            >
              <option value="public">公开</option>
              <option value="private">仅自己可见</option>
            </select>
          </label>
        ))}
        <p className="phase4-muted">
          每项设置仅隐藏自己的列表；另一人的公开列表仍可能显示同一关系。浏览历史、我的评论和编辑草稿始终私密。
        </p>
        <button
          className="phase4-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await authorClient.command("me/privacy", {
                requestId: requestIdentity(),
                privacy,
              });
              setSaved(privacy);
              onSaved();
              author.mutate();
              author.notify("隐私设置已保存");
            } catch (e) {
              setError(e instanceof Error ? e.message : "保存失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          保存隐私设置
        </button>
        <h3>已屏蔽账户</h3>
        <p className="phase4-muted">
          解除屏蔽不会恢复以前的关注。屏蔽不会阻止匿名访问公开内容。
        </p>
        {blocks?.items.map((person) => (
          <div className="phase4-actions" key={person.id}>
            <span>
              {person.displayName} · @{person.handle}
            </span>
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await authorClient.command("relationships/block", {
                    requestId: requestIdentity(),
                    targetId: person.id,
                    enabled: false,
                  });
                  await load();
                  author.mutate();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "解除失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              解除屏蔽
            </button>
          </div>
        ))}
        {blocks && blocks.items.length < blocks.total && (
          <button
            onClick={() =>
              void load(blocks.page + 1).catch((e) => setError(e.message))
            }
          >
            加载更多
          </button>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    </AuthorDialog>
  );
};
