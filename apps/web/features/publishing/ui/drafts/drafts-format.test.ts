import { describe, expect, it } from "vitest";

import {
  authorshipDetails,
  authorshipLabel,
  compareContent,
  draftDeletionScopeText,
  draftKindLabel,
  mediaEditNotes,
  missingLocalText,
  newestEditedFirst,
  relativeTime,
  remainingTrashDays,
  snapshotKindLabels,
  textExcerpt,
  trashRowState,
} from "./drafts-format";
import {
  NOW,
  content,
  daysFromNow,
  minutesAgo,
  summary,
} from "./drafts.test-support";

describe("drafts wording", () => {
  it("labels new drafts and edits, with the UI-only unnamed placeholder", () => {
    expect(draftKindLabel(summary(1, { title: "兰亭" }))).toBe("新作品");
    expect(draftKindLabel(summary(1, { kind: "edit", title: "兰亭" }))).toBe(
      "编辑「兰亭」",
    );
    expect(draftKindLabel(summary(1, { kind: "edit", title: "  " }))).toBe(
      "编辑「未命名作品」",
    );
  });

  it("names exactly one draft and the whole targeted deletion scope", () => {
    const text = draftDeletionScopeText(
      summary(1, { title: "春日", updatedAt: minutesAgo(3) }),
      NOW,
    );
    expect(text).toBe(
      "将删除新作品草稿「春日」（3 分钟前编辑），以及它的历史版本、冲突副本和只被它使用的图片。其他草稿和已发布的作品不受影响。删除后无法恢复。",
    );
    expect(
      draftDeletionScopeText(
        summary(2, { kind: "edit", title: "", updatedAt: minutesAgo(120) }),
        NOW,
      ),
    ).toContain("「未命名作品」的编辑草稿（2 小时前编辑）");
  });

  it("cuts excerpts on code points and keeps the snapshot kind labels", () => {
    expect(textExcerpt("𠀀".repeat(5), 3)).toBe("𠀀𠀀𠀀…");
    expect(textExcerpt("  第一行\r\n第二行  ")).toBe("第一行\n第二行");
    expect(snapshotKindLabels).toMatchObject({
      saved: "已保存",
      submitted: "已提交",
      published: "已发布",
      conflict: "冲突副本",
      legacy_draft: "早期草稿",
    });
    expect(relativeTime(minutesAgo(0.5), NOW)).toBe("刚刚");
    expect(relativeTime(minutesAgo(60 * 24 * 3), NOW)).toBe("3 天前");
  });

  it("marks only the parts two versions disagree on", () => {
    const base = content({ title: "同", body: "正文", items: [] });
    expect(compareContent(base, { ...base, body: "正文\r\n" })).toEqual({
      title: false,
      body: false,
      media: false,
      cover: false,
      settings: false,
    });
    expect(
      compareContent(base, { ...base, visibility: "self", title: "异" }),
    ).toMatchObject({ title: true, settings: true, body: false });
    // An undeclared 作品性质 is its own setting, never the same as 原创 (C05).
    const unset = { ...base, authorship: null };
    expect(compareContent(unset, base)).toMatchObject({ settings: true });
    expect(compareContent(unset, { ...unset })).toMatchObject({
      settings: false,
    });
  });

  it("reads an undeclared 作品性质 as 未设置 and gives it no references", () => {
    expect(authorshipLabel(null)).toBe("未设置");
    expect(authorshipLabel({ kind: "original" })).toBe("原创");
    expect(
      authorshipLabel({ kind: "copy_practice", referenceTitle: "兰亭序" }),
    ).toBe("临摹或练习");
    expect(authorshipDetails(null)).toEqual([]);
  });
});

describe("recycle bin remaining days (fixed clock)", () => {
  it("rounds partial days up and never goes below zero", () => {
    expect(remainingTrashDays(daysFromNow(30), NOW)).toBe(30);
    expect(remainingTrashDays(daysFromNow(29.01), NOW)).toBe(30);
    expect(remainingTrashDays(daysFromNow(29), NOW)).toBe(29);
    expect(remainingTrashDays(daysFromNow(0.2), NOW)).toBe(1);
    expect(remainingTrashDays(NOW.toISOString(), NOW)).toBe(0);
    expect(remainingTrashDays(daysFromNow(-2), NOW)).toBe(0);
    expect(remainingTrashDays("not a time", NOW)).toBe(0);
  });

  it("tells restorable, removed, unconfirmable and expiring rows apart", () => {
    expect(
      trashRowState({ restorable: true, purgeAfter: daysFromNow(5) }, NOW),
    ).toEqual({ kind: "restorable", days: 5 });
    expect(
      trashRowState({ restorable: true, purgeAfter: daysFromNow(0.5) }, NOW),
    ).toEqual({ kind: "restorable", days: 1 });
    expect(
      trashRowState({ restorable: false, purgeAfter: daysFromNow(5) }, NOW),
    ).toEqual({ kind: "removed" });
    expect(
      trashRowState({ restorable: false, purgeAfter: daysFromNow(1.01) }, NOW),
    ).toEqual({ kind: "removed" });
    // Within the last day the Backend's clock may already have passed the purge time.
    expect(
      trashRowState({ restorable: false, purgeAfter: daysFromNow(1) }, NOW),
    ).toEqual({ kind: "unavailable" });
    expect(
      trashRowState({ restorable: false, purgeAfter: daysFromNow(0.3) }, NOW),
    ).toEqual({ kind: "unavailable" });
    expect(
      trashRowState({ restorable: false, purgeAfter: daysFromNow(-1) }, NOW),
    ).toEqual({ kind: "expiring" });
  });
});

describe("drafts ordering and media notes", () => {
  it("orders drafts newest edited first, ties by id", () => {
    const drafts = [
      summary(1, { updatedAt: minutesAgo(30) }),
      summary(2, { updatedAt: minutesAgo(1) }),
      summary(3, { updatedAt: minutesAgo(30) }),
    ];
    expect([...drafts].sort(newestEditedFirst).map((d) => d.id)).toEqual([
      summary(2).id,
      summary(3).id,
      summary(1).id,
    ]);
  });

  it("names exactly what the missing count counts", () => {
    expect(missingLocalText(2)).toBe("2 项尚未上传，打开后需重新选择文件");
  });

  it("names rotations, crops and a cover crop in item order", () => {
    const item = (
      key: string,
      rotation: 0 | 90 | 180 | 270,
      crop: boolean,
    ) => ({
      key,
      itemId: null,
      kind: "static" as const,
      qualityMode: "standard" as const,
      edit: {
        rotation,
        crop: crop ? { x: 0, y: 0, width: 0.5, height: 1 } : null,
      },
    });
    expect(
      mediaEditNotes(
        content({
          items: [
            item("a", 0, false),
            item("b", 180, false),
            item("c", 0, true),
          ],
          coverKey: "a",
          coverCrop: { x: 0, y: 0, width: 1, height: 0.5 },
        }),
      ),
    ).toEqual(["第 2 项已旋转 180°", "第 3 项已裁剪", "封面已裁剪"]);
    expect(mediaEditNotes(content({ items: [item("a", 0, false)] }))).toEqual(
      [],
    );
  });
});
