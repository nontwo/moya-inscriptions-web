# ADR 0007: Yoyi Progressive Web Glass

- Status: Accepted
- Implementation status: Implemented for shared primary navigation and the T02
  prototype
- Date: 2026-08-13

## Context

Yoyi needs a calm functional layer above its paper-and-ink content surfaces. A
translucent navigation material can preserve context while keeping controls
legible, but copying a platform UI or applying blur to content would conflict
with the archive's own visual language and would perform inconsistently across
browsers.

## Decision

Yoyi uses an Apple HIG-inspired progressive Web material, not an Apple UI clone.
The dependency direction is:

`Yoyi theme → design tokens → material implementation → semantic component`.

The visual model has three layers:

1. Content contains inscription images, rubbings, editorial topics and text. It
   never receives Glass by default.
2. Surface provides opaque page, paper and elevated backgrounds.
3. Functional Glass is limited to navigation and, after separate approval,
   control surfaces such as toolbars, search controls, floating controls, sheets
   and popovers.

Shared tokens define `subtle`, `regular` and `prominent` material semantics,
blur, opacity and z-index. Primary navigation uses only `regular`. The shared UI
package owns the browser-specific `backdrop-filter` implementation and its
opaque fallback. Reduced transparency and increased contrast force an opaque
surface; reduced motion removes animated state changes.

Phone navigation remains a bottom Tab Bar in both orientations and may minimize
on downward content scrolling. Tablet portrait uses a persistent bottom bar;
tablet landscape uses a persistent floating left rail. PC uses a persistent
bottom Tab Bar like tablet portrait, without the brand logo and without
phone-style minimizing. These placements share the same three semantic
destinations: 首页、碑刻、书帖.

Web and any future SwiftUI client share material and component semantics, not
CSS, platform APIs or rendering implementations.

Without Owner approval, contributors must not add content, destinations,
features or interface structures while working on this material system.

## Consequences

- Unsupported browsers receive an opaque elevated navigation surface.
- Content remains readable and recognizably Yoyi without transparency.
- Glass parameters cannot be copied into pages or feature styles.
- New semantic components require an explicit design-system decision before
  adopting Functional Glass.

## References

- [Apple: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple Human Interface Guidelines: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [W3C Media Queries Level 5](https://www.w3.org/TR/mediaqueries-5/)
