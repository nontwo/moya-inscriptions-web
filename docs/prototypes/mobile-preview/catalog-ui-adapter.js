/**
 * Prototype shell only (docs/prototypes/mobile-preview).
 * Maps Catalog-shaped records onto the current preview card/detail DTOs.
 * Does not change page structure. Not Public API, not production Media.
 */
(() => {
  const kindLabels = {
    calligraphy: "书帖",
    inscription: "碑刻",
  };

  function displayText(value) {
    if (value == null) return "";
    if (typeof value === "number" && !Number.isFinite(value)) return "";
    const text = String(value).trim();
    if (!text || text === "undefined" || text === "null" || text === "NaN") {
      return "";
    }
    return text;
  }

  function displayList(values) {
    return (Array.isArray(values) ? values : [])
      .map(displayText)
      .filter(Boolean);
  }

  const demoImageSizes = {
    "calligraphy-sheet.svg": [600, 760],
    "cliff-gate.svg": [360, 520],
    "discovery-stone.svg": [600, 760],
    "ink-album.svg": [360, 540],
    "inscription-rubbing.svg": [600, 420],
    "rubbing-fragment.svg": [360, 480],
    "stele-shadow.svg": [360, 400],
    "stone-detail.svg": [360, 610],
    "valley-wall.svg": [360, 430],
  };

  function positiveDimension(value, fallback) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return Math.round(number);
    const fallbackNumber = Number(fallback);
    return Number.isFinite(fallbackNumber) && fallbackNumber > 0
      ? Math.round(fallbackNumber)
      : undefined;
  }

  function demoImageIntrinsics(src) {
    const file = String(src || "")
      .split("?")[0]
      .split("#")[0]
      .split("/")
      .pop();
    const size = demoImageSizes[file];
    if (!size) return null;
    return { width: size[0], height: size[1] };
  }

  function isUsableMediaSrc(src) {
    const value = displayText(src);
    if (!value) return false;
    const normalized = value.toLowerCase();
    if (
      normalized.startsWith("javascript:") ||
      normalized.startsWith("vbscript:") ||
      normalized.startsWith("data:text/html")
    ) {
      return false;
    }
    return (
      /^https?:\/\//i.test(value) ||
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../")
    );
  }

  function catalogKindLabel(kind) {
    return kindLabels[kind] ?? kindLabels.inscription;
  }

  function regionLabel(facts) {
    if (!facts) return "";
    return [facts.province, facts.prefecture, facts.county]
      .map(displayText)
      .filter(Boolean)
      .join(" · ");
  }

  function locationLabel(facts) {
    return displayText(facts?.currentLocation) || regionLabel(facts);
  }

  function adaptMediaItem(item, fallbackId, fallbackAlt) {
    if (!item || !isUsableMediaSrc(item.src)) return null;
    const src = displayText(item.src);
    const intrinsic = demoImageIntrinsics(src);
    return {
      alt: displayText(item.alt) || fallbackAlt,
      height: positiveDimension(item.height, intrinsic?.height),
      id: displayText(item.id) || fallbackId,
      kind: "image",
      origin: displayText(item.origin) || "catalog",
      src,
      width: positiveDimension(item.width, intrinsic?.width),
    };
  }

  function demoMediaFor(record, { index = 0, demoCards = [] } = {}) {
    const cards = Array.isArray(demoCards) ? demoCards : [];
    if (cards.length === 0) return null;
    const demoCard = cards[index % cards.length];
    if (
      !isUsableMediaSrc(demoCard?.image) &&
      !isUsableMediaSrc(demoCard?.src)
    ) {
      return null;
    }
    const title = displayText(record?.title) || "未命名";
    const src = displayText(demoCard.image) || displayText(demoCard.src);
    const intrinsic = demoImageIntrinsics(src);
    return {
      alt: `虚拟测试图，与真实记录无对应关系：${title}`,
      height: positiveDimension(demoCard.height, intrinsic?.height),
      id: `${displayText(record?.id) || "record"}-prototype-demo-media`,
      kind: "image",
      origin: "prototype-demo",
      src,
      width: positiveDimension(demoCard.width, intrinsic?.width),
    };
  }

  function missingMedia(record) {
    const title = displayText(record?.title) || "未命名";
    return {
      alt: `暂无图像：${title}`,
      height: 900,
      id: `${displayText(record?.id) || "record"}-missing-media`,
      kind: "image",
      origin: "missing",
      src: "",
      width: 1200,
    };
  }

  const prototypeGalleryCounts = {
    "p5-record-01": 5,
    "p5-record-02": 3,
    "p5-record-03": 7,
  };

  const prototypeGalleryPresets = [
    { file: "stone-detail.svg", width: 360, height: 610, label: "竖图" },
    { file: "inscription-rubbing.svg", width: 600, height: 420, label: "横图" },
    { file: "discovery-stone.svg", width: 800, height: 800, label: "方图" },
    { file: "stone-detail.svg", width: 360, height: 1400, label: "超长竖图" },
    { file: "valley-wall.svg", width: 1600, height: 400, label: "超宽横图" },
    { file: "stele-shadow.svg", width: 900, height: 960, label: "近方形" },
    { file: "cliff-gate.svg", width: 480, height: 720, label: "特殊比例" },
  ];

  function prototypeDemoGallery(record, count) {
    const title = displayText(record?.title) || "未命名";
    const id = displayText(record?.id) || "record";
    return prototypeGalleryPresets.slice(0, count).map((preset, index) => ({
      alt: `虚拟测试图，与真实记录无对应关系：${title}（${index + 1}/${count} ${preset.label}）`,
      height: preset.height,
      id: `${id}-prototype-demo-media-${index + 1}`,
      kind: "image",
      origin: "prototype-demo",
      src: `../../design-system/assets/demo/${preset.file}`,
      width: preset.width,
    }));
  }

  function sourceMediaList(record, fallbackAlt) {
    const representative = adaptMediaItem(
      record?.representativeMedia,
      `${displayText(record?.id) || "record"}-representative`,
      fallbackAlt,
    );
    const listed = (Array.isArray(record?.media) ? record.media : [])
      .map((item, index) =>
        adaptMediaItem(
          item,
          `${displayText(record?.id) || "record"}-media-${index + 1}`,
          fallbackAlt,
        ),
      )
      .filter(Boolean);
    if (listed.length > 0) return listed;
    return representative ? [representative] : [];
  }

  function resolveDisplayMedia(record, options = {}) {
    const title = displayText(record?.title) || "未命名";
    const catalogMedia = sourceMediaList(record, title);
    if (catalogMedia.length > 1) return catalogMedia;
    const galleryCount = prototypeGalleryCounts[displayText(record?.id)];
    if (galleryCount) return prototypeDemoGallery(record, galleryCount);
    if (catalogMedia.length > 0) return catalogMedia;
    const demo = demoMediaFor(record, options);
    return demo ? [demo] : [missingMedia(record)];
  }

  function adaptFacts(facts) {
    if (!facts || typeof facts !== "object") return undefined;
    const adapted = {
      dynasty: displayText(facts.dynasty),
      dateText: displayText(facts.dateText),
      province: displayText(facts.province),
      prefecture: displayText(facts.prefecture),
      county: displayText(facts.county),
      currentLocation: displayText(facts.currentLocation),
      currentCustodian: displayText(facts.currentCustodian),
    };
    return Object.values(adapted).some(Boolean) ? adapted : undefined;
  }

  function adaptSourceCitations(values) {
    return (Array.isArray(values) ? values : [])
      .map((citation) => ({
        citation: displayText(citation?.citation),
        label: displayText(citation?.label),
        url: isUsableMediaSrc(citation?.url) ? displayText(citation.url) : "",
      }))
      .filter((citation) => citation.label || citation.citation);
  }

  function adaptPublicDetail(raw, options = {}) {
    const id = displayText(raw?.id);
    const title = displayText(raw?.title);
    if (
      !id ||
      !title ||
      (raw?.kind !== "inscription" && raw?.kind !== "calligraphy") ||
      !Array.isArray(raw?.aliases) ||
      !Array.isArray(raw?.media) ||
      !Array.isArray(raw?.sourceCitations)
    ) {
      return null;
    }

    const development = options.development === true;
    const presentationFacts = adaptFacts(raw);
    const sourceCitations = adaptSourceCitations(raw.sourceCitations);
    const media = sourceMediaList(raw, title);
    const introduction = displayText(raw.description);

    return {
      aliases: displayList(raw.aliases),
      catalogSource: "public",
      explanation: development ? "内容待接入" : undefined,
      factsPlaceholder:
        development && !presentationFacts ? "资料待接入" : undefined,
      historicalContext: development ? "内容待接入" : undefined,
      id,
      introduction: introduction || (development ? "内容待接入" : undefined),
      kind: raw.kind,
      media,
      periodLabel: displayText(raw.periodLabel) || undefined,
      presentationFacts,
      representativeMedia: media[0],
      scholarlyResearch: development ? "内容待接入" : undefined,
      sourceCitations,
      sourcesPlaceholder:
        development && sourceCitations.length === 0 ? "内容待接入" : undefined,
      title,
      transcription: development ? "内容待接入" : undefined,
    };
  }

  function searchText(record) {
    return [
      record.title,
      ...(Array.isArray(record.aliases) ? record.aliases : []),
      catalogKindLabel(record.kind),
      record.periodLabel,
      ...Object.values(record.prototypeFacts ?? {}),
      record.summary,
      record.description,
    ]
      .map(displayText)
      .filter(Boolean)
      .join(" ");
  }

  function adaptRecord(raw, options = {}) {
    const id = displayText(raw?.id);
    const title = displayText(raw?.title) || (id ? `条目 ${id}` : "未命名");
    const kind = raw?.kind === "calligraphy" ? "calligraphy" : "inscription";
    const aliases = displayList(raw?.aliases);
    const summary = displayText(raw?.summary);
    const description = displayText(raw?.description);
    const introduction = displayText(raw?.introduction) || summary;
    const transcription = displayText(raw?.transcription);
    const historicalContext = displayText(raw?.historicalContext);
    const scholarlyResearch = displayText(raw?.scholarlyResearch);
    const explanation = displayText(raw?.explanation) || description;
    const periodLabel = displayText(raw?.periodLabel);
    const prototypeFacts = adaptFacts(raw?.prototypeFacts);
    const sourceCitations = adaptSourceCitations(raw?.sourceCitations);
    const media = resolveDisplayMedia({ ...raw, id, title }, options);
    const calligraphyCategory =
      raw?.calligraphyCategory === "rubbing" ? "rubbing" : "ink";
    return {
      aliases,
      calligraphyCategory,
      description: description || undefined,
      explanation: explanation || undefined,
      historicalContext: historicalContext || undefined,
      id: id || "unknown-record",
      introduction: introduction || undefined,
      kind,
      media,
      periodLabel: periodLabel || undefined,
      presentationFacts: prototypeFacts,
      prototypeFacts,
      representativeMedia: media[0],
      scholarlyResearch: scholarlyResearch || undefined,
      sourceCitations,
      summary: summary || undefined,
      title,
      transcription: transcription || undefined,
    };
  }

  function cardMeta(record, role) {
    if (role === "nearby") return locationLabel(record.prototypeFacts);
    if (role === "calligraphy") {
      return [record.periodLabel, catalogKindLabel(record.kind)]
        .filter(Boolean)
        .join(" · ");
    }
    if (role === "inscription") {
      return [catalogKindLabel(record.kind), record.periodLabel]
        .filter(Boolean)
        .join(" · ");
    }
    return displayText(record.periodLabel);
  }

  function inscriptionsFrom(records) {
    return records.filter((record) => record.kind === "inscription");
  }

  function calligraphyFrom(records) {
    return records.filter((record) => record.kind === "calligraphy");
  }

  function nearbyFrom(records) {
    return inscriptionsFrom(records).filter((record) =>
      displayText(record.prototypeFacts?.currentLocation),
    );
  }

  function topicCollections(records) {
    const groups = new Map();
    inscriptionsFrom(records).forEach((record) => {
      const dynasty = displayText(record.prototypeFacts?.dynasty) || "未标朝代";
      const current = groups.get(dynasty) ?? [];
      current.push(record);
      groups.set(dynasty, current);
    });
    return [...groups.entries()]
      .map(([dynasty, items]) => {
        const cover = items[0]?.media?.[0];
        return {
          blurb: `${items.length} 条碑刻`,
          cover: cover?.src ?? "",
          coverAlt: cover?.alt || `${dynasty}专题封面`,
          id: `p5-topic-${dynasty}`,
          kind: "catalogCollection",
          recordIds: items.map((item) => item.id),
          title: dynasty,
        };
      })
      .sort((left, right) => {
        if (right.recordIds.length !== left.recordIds.length) {
          return right.recordIds.length - left.recordIds.length;
        }
        return left.title.localeCompare(right.title, "zh-CN");
      });
  }

  globalThis.YOYI_CATALOG_UI_ADAPTER = {
    adaptRecord,
    adaptPublicDetail,
    calligraphyFrom,
    cardMeta,
    catalogKindLabel,
    demoImageIntrinsics,
    demoMediaFor,
    displayText,
    inscriptionsFrom,
    isUsableMediaSrc,
    locationLabel,
    nearbyFrom,
    regionLabel,
    resolveDisplayMedia,
    searchText,
    topicCollections,
    prototypeDemoGallery,
  };
})();
