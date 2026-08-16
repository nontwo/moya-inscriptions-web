/**
 * Prototype-only additions for exercising long home feeds.
 * These records are not catalogue data and must not be used by production UI.
 */

(() => {
  const card = (id, title, image, alt) => ({ id, title, image, alt });
  const asset = (name) => `../../design-system/assets/demo/${name}.svg`;

  const feedCards = {
    discover: [
      card(
        "discover-ridge",
        "云岭题名",
        asset("valley-wall"),
        "虚构云岭题名图",
      ),
      card(
        "discover-rubbing",
        "古拓新识",
        asset("rubbing-fragment"),
        "虚构古拓残片图",
      ),
      card(
        "discover-gate-script",
        "石门行书",
        asset("cliff-gate"),
        "虚构石门行书图",
      ),
      card(
        "discover-inscription",
        "断崖残铭",
        asset("inscription-rubbing"),
        "虚构断崖残铭图",
      ),
      card(
        "discover-valley",
        "溪谷摩崖",
        asset("discovery-stone"),
        "虚构溪谷摩崖图",
      ),
      card(
        "discover-stone-note",
        "石上题记",
        asset("stone-detail"),
        "虚构石上题记图",
      ),
    ],
    nearby: [
      card(
        "nearby-temple",
        "南寺碑廊",
        asset("stele-shadow"),
        "虚构南寺碑廊图",
      ),
      card("nearby-stream", "东涧题名", asset("valley-wall"), "虚构东涧题名图"),
      card("nearby-pass", "山口残刻", asset("cliff-gate"), "虚构山口残刻图"),
      card("nearby-paper", "旧藏墨册", asset("ink-album"), "虚构旧藏墨册图"),
      card(
        "nearby-fragment",
        "桥北断碑",
        asset("stone-detail"),
        "虚构桥北断碑图",
      ),
      card(
        "nearby-ink",
        "近郊拓影",
        asset("inscription-rubbing"),
        "虚构近郊拓影图",
      ),
    ],
  };

  globalThis.YOYI_HOME_FEED_PLACEHOLDER = {
    version: "home-feed-v1",
    feedCards,
  };
})();
