import { randomUUID } from "node:crypto";
const opaque = (prefix) => prefix + "-" + randomUUID().replaceAll("-", "");
const assert = (condition, code) => {
  if (!condition) throw new Error(code);
};

/** Supporting identities are journaled before writes and audited in the same
 * transaction. Re-running never resets later acceptance actions. */
export async function seedSupport({
  manifest,
  journal,
  saveJournal,
  once,
  ownerDb,
  authors,
  discussion,
  counters,
}) {
  if (!journal.support) {
    const [a1, a2, a3] = manifest.accounts.map((x) => x.id);
    const rows = [];
    const byKey = {};
    const time = Date.now() - 3600000;
    const root = (key, target, author, text, moderation = "visible") => {
      const item = {
        key,
        id: opaque("comment"),
        auditId: randomUUID(),
        target,
        author,
        text,
        moderation,
        createdAt: new Date(time + rows.length * 100).toISOString(),
        rootId: null,
      };
      rows.push(item);
      byKey[key] = item;
      return item;
    };
    const reply = (key, parent, author, text, moderation = "visible") => {
      const item = {
        key,
        id: opaque("comment"),
        auditId: randomUUID(),
        target: parent.target,
        author,
        text,
        moderation,
        createdAt: new Date(time + rows.length * 100).toISOString(),
        rootId: parent.id,
      };
      rows.push(item);
      byKey[key] = item;
      return item;
    };
    const c1 = { type: "catalog", id: manifest.catalogs[0].catalogId };
    const c5 = { type: "catalog", id: manifest.catalogs[4].catalogId };
    const w2 = { type: "work", id: manifest.works[1].id };
    const w5 = { type: "work", id: manifest.works[4].id };
    root(
      "heat-1",
      c1,
      a1,
      "合成热门甲：两个根点赞；回复的点赞不计入本条热度。",
    );
    root(
      "heat-2",
      c1,
      a2,
      "合成热门乙：同为两个根点赞，较新发布所以排在前面。",
    );
    const late = root(
      "late-root",
      c1,
      a3,
      "合成定位根：这条位于最新评论第二页，十一条回复按时间排列。",
    );
    for (let n = 1; n <= 10; n++)
      root(
        "latest-" + n,
        c1,
        n % 2 ? a1 : a2,
        `合成最新评论 ${String(n).padStart(2, "0")}：支持分页与返回定位。`,
      );
    for (let n = 1; n <= 11; n++)
      reply(
        "late-reply-" + n,
        late,
        n === 11 ? a3 : n % 2 ? a1 : a2,
        `合成回复 ${String(n).padStart(2, "0")}：${n === 11 ? "最后这条属于参观者，可从我的评论定位到回复第二页。" : "保持平铺时间顺序。"}`,
      );
    const pending = root(
      "pending-root",
      w2,
      a1,
      "合成私密待审原文：只有作者本人可以在作品讨论和我的评论中看到。",
      "pending",
    );
    reply(
      "pending-reply",
      pending,
      a1,
      "合成作者自己的待审回复：不出现在其他账号的公开计数中。",
      "pending",
    );
    const hidden = root(
      "hidden-root",
      w2,
      a1,
      "合成隐藏原文：审核隐藏后作者仍能读自己的完整文字。",
    );
    reply(
      "hidden-reply",
      hidden,
      a1,
      "合成隐藏根下的自有回复：不泄漏第三方上下文。",
    );
    const body = root(
      "body-root",
      c5,
      a1,
      "合成已删除正文：用户端必须只显示删除占位，不能读回这段原文。",
    );
    reply(
      "body-reply-1",
      body,
      a2,
      "合成保留回复甲：删除根正文不会删除其他人的回复。",
    );
    reply("body-reply-2", body, a3, "合成保留回复乙：占位仍维持原线程关系。");
    for (const key of ["removed", "admin-demo"]) {
      const parent = root(
        key + "-root",
        w5,
        a1,
        key === "removed"
          ? "合成已移除线程：所有产品账号均不可恢复。"
          : "合成后台操作示例：根与两条回复，共影响三条。",
      );
      reply(
        key + "-reply-1",
        parent,
        a2,
        "合成跨作者回复甲：整帖移除后我的评论也不可恢复。",
      );
      reply(
        key + "-reply-2",
        parent,
        a3,
        "合成跨作者回复乙：请核对删除正文和整帖移除的范围差异。",
      );
    }
    journal.support = {
      version: 1,
      rows,
      hideEventId: opaque("moderation"),
      hideAt: new Date().toISOString(),
      likes: [
        { key: "heat-1", actor: a2 },
        { key: "heat-1", actor: a3 },
        { key: "heat-2", actor: a1 },
        { key: "heat-2", actor: a3 },
        { key: "late-reply-1", actor: a2 },
        { key: "late-reply-1", actor: a3 },
      ],
    };
    saveJournal();
  }
  const support = journal.support;
  const rowByKey = new Map(support.rows.map((x) => [x.key, x]));
  assert(
    support.rows.length === 37 &&
      new Set(support.rows.map((x) => x.id)).size === 37,
    "SUPPORT_PLAN_MISMATCH",
  );
  for (const row of support.rows)
    await once("support:" + row.key, async () => {
      assert(
        manifest.accounts.some((x) => x.id === row.author) &&
          (row.target.type === "catalog"
            ? manifest.catalogs.some((x) => x.catalogId === row.target.id)
            : manifest.works.some((x) => x.id === row.target.id)),
        "SUPPORT_SCOPE_MISMATCH",
      );
      await ownerDb.query("BEGIN");
      try {
        // Both identity families are checked; a collision is never overwritten.
        const prior = (
          await ownerDb.query(
            "SELECT id,author_id,text,catalog_id AS target_id,target_type,NULL::text AS root_id FROM community.catalog_comments WHERE id=$1 UNION ALL SELECT r.id,r.author_id,r.text,c.catalog_id,c.target_type,r.root_comment_id FROM community.catalog_comment_replies r JOIN community.catalog_comments c ON c.id=r.root_comment_id WHERE r.id=$1",
            [row.id],
          )
        ).rows;
        if (prior.length) {
          const p = prior[0];
          assert(
            prior.length === 1 &&
              p.author_id === row.author &&
              p.text === row.text &&
              p.target_id === row.target.id &&
              p.target_type === row.target.type &&
              p.root_id === row.rootId,
            "SUPPORT_IDENTITY_COLLISION",
          );
          assert(
            (
              await ownerDb.query(
                "SELECT id FROM community.author_events WHERE id=$1 AND actor_id=$2 AND subject_id=$3 AND action='synthetic.comment.seed'",
                [row.auditId, row.author, row.id],
              )
            ).rowCount === 1,
            "SUPPORT_AUDIT_MISSING",
          );
        } else {
          if (row.rootId)
            await ownerDb.query(
              "INSERT INTO community.catalog_comment_replies(id,root_comment_id,author_id,text,moderation,created_at) VALUES($1,$2,$3,$4,$5,$6)",
              [
                row.id,
                row.rootId,
                row.author,
                row.text,
                row.moderation,
                row.createdAt,
              ],
            );
          else
            await ownerDb.query(
              "INSERT INTO community.catalog_comments(id,catalog_id,target_type,author_id,text,moderation,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
              [
                row.id,
                row.target.id,
                row.target.type,
                row.author,
                row.text,
                row.moderation,
                row.createdAt,
              ],
            );
          await ownerDb.query(
            "INSERT INTO community.author_events(id,actor_id,action,subject_id) VALUES($1,$2,'synthetic.comment.seed',$3)",
            [row.auditId, row.author, row.id],
          );
          counters.support++;
        }
        await ownerDb.query("COMMIT");
      } catch (error) {
        await ownerDb.query("ROLLBACK");
        throw error;
      }
    });
  for (const like of support.likes)
    await once("support-like:" + like.key + ":" + like.actor, (requestId) =>
      discussion.setDiscussionLike(
        like.actor,
        rowByKey.get(like.key).id,
        true,
        requestId,
      ),
    );
  await once("support-hide", async () => {
    const audit = (
      await ownerDb.query(
        "SELECT subject_id,action,operator_label FROM community.moderation_events WHERE id=$1",
        [support.hideEventId],
      )
    ).rows[0];
    if (audit) {
      assert(
        audit.subject_id === rowByKey.get("hidden-root").id &&
          audit.action === "hide" &&
          audit.operator_label === "phase4-synthetic-seed",
        "SUPPORT_HIDE_AUDIT_COLLISION",
      );
      return;
    }
    const result = await discussion.applyCommentModeration(
      rowByKey.get("hidden-root").id,
      "hidden",
      ["visible"],
      "phase4-synthetic-seed",
      new Date(support.hideAt),
      {
        id: support.hideEventId,
        occurredAt: new Date(support.hideAt),
        operatorLabel: "phase4-synthetic-seed",
        action: "hide",
        detail: "Synthetic self-visibility acceptance",
      },
    );
    assert(result, "SUPPORT_HIDE_CONFLICT");
  });
  await once("support-delete-body", (requestId) =>
    discussion.operatorDeleteBody(
      "phase4-synthetic-seed",
      rowByKey.get("body-root").id,
      requestId,
    ),
  );
  await once("support-remove-thread", (requestId) =>
    discussion.removeDiscussionThread(
      "phase4-synthetic-seed",
      rowByKey.get("removed-root").id,
      requestId,
      3,
    ),
  );
  const drafts = manifest.supportingScenarios.find(
    (x) => x.fixtureKey === "parallel-work-drafts",
  );
  for (let index = 0; index < drafts.versions.length; index++)
    await once("support-draft:" + index, (requestId) =>
      authors.saveDraft(drafts.authorId, drafts.workId, {
        requestId,
        baseWorkVersion: drafts.baseWorkVersion,
        baseDraftVersion: drafts.baseDraftVersion,
        content: { ...drafts.versions[index], mediaIds: [] },
      }),
    );
}
