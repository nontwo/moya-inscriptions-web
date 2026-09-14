"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConfirmationModal, SetStepNav, useModal } from "@payloadcms/ui";
import type {
  FeaturedPage,
  OperatorWork,
  OperatorWorkPage,
} from "@moya/contracts/internal/community-operator";
import type { ContentIdentity } from "@moya/contracts";
import {
  call,
  describeFailure,
  formatTime,
  submissionStateLabels,
  UNTITLED_WORK,
} from "./api";
import type { OperatorWorkSubmission } from "./api";
import { SubmissionDetail } from "./work-submissions-client";
import styles from "./community.module.css";

type Tab = "works" | "featured";
type CandidatePage = {
  items: { id: string; title: string }[];
  total: number;
  page: number;
  pageSize: number;
};
type Operation = {
  name: string;
  input: Record<string, unknown>;
  label: string;
};
const labels = { visible: "正常", hidden: "已隐藏", removed: "已移除" };
const PAGE_SIZE = 20;
const Pager = ({
  page,
  total,
  busy,
  onPage,
}: {
  page: number;
  total: number;
  busy: boolean;
  onPage: (page: number) => void;
}) => (
  <div className={styles.pager}>
    <span>
      共 {total} 项 · 第 {total === 0 ? 0 : page} /{" "}
      {Math.ceil(total / PAGE_SIZE)} 页
    </span>
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.actionButton}
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        上一页
      </button>
      <button
        type="button"
        className={styles.actionButton}
        disabled={busy || page * PAGE_SIZE >= total}
        onClick={() => onPage(page + 1)}
      >
        下一页
      </button>
    </div>
  </div>
);

/** Owner commands retain their request identity until the response is reconciled. */
export const CommunityContentClient = () => {
  const params = useSearchParams();
  const { openModal, closeModal } = useModal();
  const [selectedWork, setSelectedWork] = useState<OperatorWork | null>(null);
  const detailOpener = useRef<HTMLElement | null>(null);
  const detailRequest = useRef(0);
  const [tab, setTab] = useState<Tab>("works");
  const [query, setQuery] = useState({
    page: 1,
    search: params.get("q") ?? "",
  });
  const [search, setSearch] = useState(query.search);
  const [works, setWorks] = useState<OperatorWorkPage | null>(null);
  const [featured, setFeatured] = useState<FeaturedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commandLock = useRef(false);
  const request = useRef(0);
  const [retry, setRetry] = useState<Operation | null>(null);
  const [confirmation, setConfirmation] = useState<Operation | null>(null);
  const [quantity, setQuantity] = useState("");
  const settingsVersion = useRef<number | null>(null);
  const load = useCallback(async () => {
    const epoch = ++request.current;
    setLoading(true);
    setError(null);
    try {
      if (tab === "works") {
        const result = await call<OperatorWorkPage>("read-works", {
          ...query,
          pageSize: PAGE_SIZE,
        });
        if (epoch === request.current) {
          setWorks(result);
          setSelectedWork((current) =>
            current === null
              ? null
              : (result.items.find((item) => item.id === current.id) ??
                current),
          );
        }
      } else {
        const result = await call<FeaturedPage>("read-featured", {
          ...query,
          pageSize: PAGE_SIZE,
        });
        if (epoch === request.current) {
          setFeatured(result);
          if (settingsVersion.current !== result.settingsVersion) {
            settingsVersion.current = result.settingsVersion;
            setQuantity(
              result.enabledQuantity === null
                ? ""
                : String(result.enabledQuantity),
            );
          }
        }
      }
    } catch (e) {
      if (epoch === request.current) setError(describeFailure(e).text);
    } finally {
      if (epoch === request.current) setLoading(false);
    }
  }, [tab, query]);
  useEffect(() => {
    void load();
    return () => {
      request.current++;
      detailRequest.current++;
    };
  }, [load]);
  const run = async (op: Operation) => {
    if (commandLock.current) return;
    commandLock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await call(op.name, op.input);
      if (op.name === "moderate-work") {
        const updated = result as OperatorWork;
        setSelectedWork((current) =>
          current?.id === updated.id ? updated : current,
        );
      }
      setRetry(null);
      setNotice(`${op.label}已保存。`);
      await load();
    } catch (e) {
      const failure = describeFailure(e);
      setNotice(failure.text);
      setRetry(
        failure.code === "STATE_CONFLICT" ||
          failure.code === "NOT_FOUND" ||
          failure.code === "COMMAND_INVALID"
          ? null
          : op,
      );
    } finally {
      commandLock.current = false;
      setBusy(false);
    }
  };
  const execute = (
    name: string,
    input: Record<string, unknown>,
    label: string,
  ) =>
    void run({
      name,
      input: { ...input, requestId: crypto.randomUUID() },
      label,
    });
  const disabled = busy || retry !== null;
  const chooseTab = (next: Tab) => {
    detailRequest.current++;
    setSelectedWork(null);
    setTab(next);
    setQuery({ page: 1, search: "" });
    setSearch("");
  };
  const feature = (target: ContentIdentity, title: string) =>
    execute(
      "set-featured",
      { target, enabled: true, position: 0, expectedVersion: 0 },
      `推荐「${title}」`,
    );
  const confirmWork = (item: OperatorWork, state: OperatorWork["state"]) => {
    setConfirmation({
      name: "moderate-work",
      input: {
        id: item.id,
        state,
        expectedVersion: item.version,
        requestId: crypto.randomUUID(),
      },
      label: `${labels[state]}「${item.title}」`,
    });
    openModal("community-work-confirm");
  };
  const openWork = async (
    id: string,
    opener: HTMLElement,
    known?: OperatorWork,
  ) => {
    const sequence = ++detailRequest.current;
    detailOpener.current = opener;
    setSelectedWork(null);
    try {
      const item =
        known ??
        (
          await call<OperatorWorkPage>("read-works", {
            page: 1,
            pageSize: 20,
            search: id,
          })
        ).items.find((work) => work.id === id);
      if (sequence !== detailRequest.current) return;
      if (!item) {
        setNotice("该作品当前不可用。");
        return;
      }
      setSelectedWork(item);
    } catch (error) {
      if (sequence === detailRequest.current)
        setNotice(describeFailure(error).text);
    }
  };
  const workActions = (item: OperatorWork) => (
    <div className={styles.actions}>
      {(["visible", "hidden", "removed"] as const)
        .filter((state) => state !== item.state)
        .map((state) => (
          <button
            type="button"
            className={styles.actionButton}
            key={state}
            disabled={disabled || item.authorDeleted}
            onClick={() => confirmWork(item, state)}
          >
            {state === "visible"
              ? "解除管理限制"
              : state === "hidden"
                ? "隐藏作品"
                : "移除作品"}
          </button>
        ))}
      <button
        className={styles.actionButton}
        type="button"
        disabled={disabled || item.authorDeleted}
        onClick={() =>
          feature(
            { type: "work", id: item.id },
            item.latestSubmission
              ? item.latestSubmission.title || UNTITLED_WORK
              : item.title || UNTITLED_WORK,
          )
        }
      >
        加入推荐
      </button>
    </div>
  );
  return (
    <div className={styles.workspace}>
      <SetStepNav
        nav={[
          { label: "社区", url: "/admin/community-moderation" },
          { label: "作品与推荐" },
        ]}
      />
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>作品与推荐</h1>
          <p className={styles.lead}>
            管理已有作品的可见性与首页推荐。更新不改变内容的首次发布时间。
          </p>
        </div>
        <Link href="/admin/community-moderation">评论审核队列</Link>
      </header>
      <div className={styles.tabs} aria-label="内容管理">
        <button
          className={styles.tab}
          type="button"
          aria-pressed={tab === "works"}
          onClick={() => chooseTab("works")}
        >
          用户作品
        </button>
        <button
          className={styles.tab}
          type="button"
          aria-pressed={tab === "featured"}
          onClick={() => chooseTab("featured")}
        >
          推荐内容
        </button>
      </div>
      {notice ? (
        <div className={styles.notice} role="status">
          {notice}
          {retry ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(retry)}
            >
              重试同一操作
            </button>
          ) : null}
        </div>
      ) : null}
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ page: 1, search: search.trim() });
        }}
      >
        <label>
          搜索{tab === "works" ? "作品、作者或作品 ID" : "推荐标题"}
          <input
            maxLength={200}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          className={styles.actionButton}
          type="submit"
          disabled={loading}
        >
          搜索
        </button>
        <button
          className={styles.actionButton}
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          刷新当前页
        </button>
      </form>
      {error ? (
        <p className={styles.notice} role="alert">
          {error}
          <button type="button" disabled={loading} onClick={() => void load()}>
            重试读取
          </button>
        </p>
      ) : null}
      {loading ? <p role="status">读取中…</p> : null}
      {tab === "works" && works ? (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>作品</th>
                  <th>作者</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {works.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        type="button"
                        className={styles.rowLink}
                        onClick={(event) =>
                          void openWork(item.id, event.currentTarget, item)
                        }
                      >
                        {item.latestSubmission
                          ? item.latestSubmission.title || UNTITLED_WORK
                          : item.title || UNTITLED_WORK}
                      </button>
                      {item.latestSubmission ? (
                        <span className={styles.secondary}>
                          最新公开提交 ·{" "}
                          {
                            submissionStateLabels[
                              item.latestSubmission.disposition
                            ]
                          }
                        </span>
                      ) : null}
                      <span className={styles.secondary}>{item.id}</span>
                      <button
                        type="button"
                        className={styles.actionButton}
                        onClick={(event) =>
                          void openWork(item.id, event.currentTarget, item)
                        }
                      >
                        查看详情与管理
                      </button>
                      <span className={styles.secondary}>
                        {/* Null for a work never publicly exposed (self-only or
                            still awaiting its first approval). */}
                        {item.firstPublishedAt === null
                          ? "尚未公开发布"
                          : `首次发布 ${formatTime(item.firstPublishedAt)}`}
                      </span>
                    </td>
                    <td>
                      {item.authorName}
                      <span className={styles.secondary}>
                        {item.authorStatus === "suspended"
                          ? "账号已停用"
                          : item.authorId}
                      </span>
                    </td>
                    <td>
                      {item.authorDeleted ? "作者已删除" : labels[item.state]}
                      <span className={styles.secondary}>
                        {item.publiclyVisible
                          ? "当前对外公开"
                          : "当前不对外显示"}
                      </span>
                    </td>
                    <td>{workActions(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {works.total === 0 ? <p>没有符合条件的作品。</p> : null}
          <Pager
            page={query.page}
            total={works.total}
            busy={loading || busy}
            onPage={(page) => setQuery((q) => ({ ...q, page }))}
          />
        </>
      ) : null}
      {tab === "featured" ? (
        <>
          {featured ? (
            <>
              <form
                className={styles.filters}
                onSubmit={(e) => {
                  e.preventDefault();
                  const value =
                    quantity.trim() === "" ? null : Number(quantity);
                  if (
                    value !== null &&
                    (!Number.isSafeInteger(value) || value < 0)
                  ) {
                    setNotice("推荐数量须为非负整数；留空表示不限。");
                    return;
                  }
                  execute(
                    "set-featured-quantity",
                    {
                      enabledQuantity: value,
                      expectedVersion: featured.settingsVersion,
                    },
                    "推荐数量",
                  );
                }}
              >
                <label>
                  启用数量（留空不限，0 暂停推荐）
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  className={styles.actionButton}
                  disabled={disabled}
                >
                  保存数量
                </button>
              </form>
              <p className={styles.secondary}>
                按顺序值从小到大排列，同值按内容身份稳定排序。不可用内容保留配置但不展示；恢复后重新参与推荐。正在浏览的列表保持原有顺序，刷新后使用新配置。
              </p>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>内容</th>
                      <th>展示资格</th>
                      <th>排序与启用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {featured.items.map((item) => (
                      <FeaturedRow
                        onOpenWork={(id, opener) => void openWork(id, opener)}
                        key={`${item.target.type}:${item.target.id}:${item.version}`}
                        item={item}
                        disabled={disabled}
                        onSave={(position, enabled) =>
                          execute(
                            "set-featured",
                            {
                              target: item.target,
                              position,
                              enabled,
                              expectedVersion: item.version,
                            },
                            "推荐设置",
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {featured.total === 0 ? <p>尚无符合条件的推荐配置。</p> : null}
              <Pager
                page={query.page}
                total={featured.total}
                busy={loading || busy}
                onPage={(page) => setQuery((q) => ({ ...q, page }))}
              />
            </>
          ) : null}
          <CatalogPicker
            disabled={disabled}
            onFeature={(id, title) => feature({ type: "catalog", id }, title)}
          />
          <p>
            用户作品可在「用户作品」页加入推荐；已经加入的内容请在推荐列表中编辑。
          </p>
        </>
      ) : null}
      {selectedWork === null ? null : (
        <WorkDetailPanel
          key={selectedWork.id}
          item={selectedWork}
          actions={workActions(selectedWork)}
          onClose={() => {
            detailRequest.current++;
            setSelectedWork(null);
            detailOpener.current?.focus();
          }}
        />
      )}
      <ConfirmationModal
        heading="确认作品管理状态变更"
        modalSlug="community-work-confirm"
        cancelLabel="取消"
        confirmLabel="确认保存"
        confirmingLabel="保存中…"
        body={
          <p>
            {confirmation?.label}
            。隐藏或移除会限制访问；解除管理限制仍遵循作者的可见范围和当前审核结果，不会代替审核通过。原有身份、首次发布时间和审计记录保留。
          </p>
        }
        onConfirm={async () => {
          closeModal("community-work-confirm");
          if (confirmation) await run(confirmation);
          setConfirmation(null);
        }}
      />
    </div>
  );
};

const FeaturedRow = ({
  item,
  disabled,
  onSave,
  onOpenWork,
}: {
  item: FeaturedPage["items"][number];
  disabled: boolean;
  onSave: (position: number, enabled: boolean) => void;
  onOpenWork: (id: string, opener: HTMLElement) => void;
}) => {
  const [position, setPosition] = useState(String(item.position));
  const [enabled, setEnabled] = useState(item.enabled);
  const [error, setError] = useState(false);
  return (
    <tr>
      <td>
        {item.target.type === "work" ? (
          <button
            type="button"
            className={styles.rowLink}
            onClick={(event) => onOpenWork(item.target.id, event.currentTarget)}
          >
            {item.title || UNTITLED_WORK} · 查看详情
          </button>
        ) : (
          (item.title ?? "当前不可用的内容")
        )}
        <span className={styles.secondary}>
          {item.target.type === "work" ? "用户作品" : "资料"} · {item.target.id}
        </span>
      </td>
      <td>{item.eligible ? "可展示" : "不可展示（配置保留）"}</td>
      <td>
        <form
          className={styles.filters}
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(position);
            if (!Number.isSafeInteger(value) || value < 0 || position === "") {
              setError(true);
              return;
            }
            setError(false);
            onSave(value, enabled);
          }}
        >
          <label>
            顺序
            <input
              aria-label={`顺序：${item.title ?? item.target.id}`}
              type="number"
              min="0"
              step="1"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            启用
          </label>
          <button
            className={styles.actionButton}
            type="submit"
            disabled={disabled}
          >
            保存
          </button>
          {error ? <span role="alert">请输入非负整数顺序。</span> : null}
        </form>
      </td>
    </tr>
  );
};

const CatalogPicker = ({
  disabled,
  onFeature,
}: {
  disabled: boolean;
  onFeature: (id: string, title: string) => void;
}) => {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState<{ page: number; search: string } | null>(
    null,
  );
  const [data, setData] = useState<CandidatePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    if (!query) return;
    const epoch = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const result = await call<CandidatePage>("read-feature-catalogs", {
        ...query,
        pageSize: PAGE_SIZE,
      });
      if (epoch === sequence.current) setData(result);
    } catch (e) {
      if (epoch === sequence.current) setError(describeFailure(e).text);
    } finally {
      if (epoch === sequence.current) setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);
  return (
    <section className={styles.card}>
      <h2>添加已公开资料</h2>
      <form
        className={styles.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ page: 1, search: search.trim() });
        }}
      >
        <label>
          资料标题
          <input
            value={search}
            maxLength={200}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="submit"
          className={styles.actionButton}
          disabled={loading}
        >
          查找资料
        </button>
      </form>
      {error ? (
        <p role="alert">
          {error}
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </p>
      ) : null}
      {loading ? <p role="status">读取中…</p> : null}
      {data ? (
        <>
          <ul>
            {data.items.map((item) => (
              <li key={item.id}>
                {item.title}{" "}
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={disabled}
                  onClick={() => onFeature(item.id, item.title)}
                >
                  加入推荐
                </button>
              </li>
            ))}
          </ul>
          {data.total === 0 ? <p>没有符合条件的已公开资料。</p> : null}
          <Pager
            page={query?.page ?? 1}
            total={data.total}
            busy={loading}
            onPage={(page) => setQuery((q) => (q ? { ...q, page } : q))}
          />
        </>
      ) : null}
    </section>
  );
};

const WorkDetailPanel = ({
  item,
  actions,
  onClose,
}: {
  item: OperatorWork;
  actions: React.ReactNode;
  onClose: () => void;
}) => {
  const panel = useRef<HTMLElement | null>(null);
  const [revision, setRevision] = useState(
    item.latestSubmission?.revisionId ?? item.publicRevisionId,
  );
  const [detail, setDetail] = useState<OperatorWorkSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    panel.current?.focus();
    panel.current?.scrollIntoView({ block: "start" });
  }, []);
  useEffect(() => {
    let current = true;
    setDetail(null);
    setError(null);
    if (revision)
      void call<OperatorWorkSubmission>("read-work-submission", {
        id: revision,
      }).then(
        (data) => {
          if (current) setDetail(data);
        },
        (error) => {
          if (current) setError(describeFailure(error).text);
        },
      );
    return () => {
      current = false;
    };
  }, [revision, retry]);
  return (
    <section
      className={styles.panel}
      ref={panel}
      tabIndex={-1}
      aria-label="作品详情与管理"
      data-work-management-detail=""
    >
      <div className={styles.panelHeader}>
        <h2>作品详情与管理</h2>
        <button type="button" className={styles.actionButton} onClick={onClose}>
          返回列表
        </button>
      </div>
      <p>
        {item.publiclyVisible ? "当前对外公开" : "当前不对外显示"} · 管理状态：
        {labels[item.state]}
      </p>
      {actions}
      <div className={styles.tabs}>
        {item.latestSubmission ? (
          <button
            className={styles.tab}
            type="button"
            aria-pressed={revision === item.latestSubmission.revisionId}
            onClick={() => setRevision(item.latestSubmission!.revisionId)}
          >
            最新公开提交
          </button>
        ) : null}
        {item.publicRevisionId &&
        item.publicRevisionId !== item.latestSubmission?.revisionId ? (
          <button
            className={styles.tab}
            type="button"
            aria-pressed={revision === item.publicRevisionId}
            onClick={() => setRevision(item.publicRevisionId)}
          >
            {item.publiclyVisible ? "当前公开版本" : "上次公开版本"}
          </button>
        ) : null}
      </div>
      {!revision ? (
        <p>
          暂无可供管理查看的公开提交。私人草稿和仅自己可见的提交不在此展示。
        </p>
      ) : error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            重试读取详情
          </button>
        </p>
      ) : detail === null ? (
        <p role="status">正在读取详情…</p>
      ) : (
        <SubmissionDetail
          key={detail.revisionId}
          data={detail}
          actions={
            <Link
              href={`/admin/community-moderation/work-submissions?item=${encodeURIComponent(detail.revisionId)}`}
            >
              打开提交审核与处理
            </Link>
          }
        />
      )}
    </section>
  );
};
