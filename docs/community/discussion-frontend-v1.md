# Discussion frontend v1

Owner authority: September 20 reference annotations and request to implement the
Discussion screens, followed by explicit inclusion of Specials and the direction
that all Specials use large, academic-style image-background cards with generous
overlaid text. This continues the frontend-only development preview.

| Scenario            | Development                                                                                                                                     | Production                    | Must preserve                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------- |
| News                | Image/text cards with generous title and summary space; opens a full sample article                                                             | Current source/empty behavior | Existing tabs, icons, shell and source scroll              |
| Article comments    | Left swipe or button opens comments; right swipe or button returns to saved reading position                                                    | No synthetic data             | Existing Catalog detail behavior unchanged                 |
| Article bottom      | Scrolling to the article end reveals inline comments; horizontal comment entry stays disabled for that article for this preview session         | No new behavior               | No second comments section and no lost reading position    |
| Topics              | Exactly 22 sample topics sorted by heat; text only; opened entries turn gray                                                                    | Current source/empty behavior | Keyboard access and list scroll restoration                |
| Topic detail        | Main topic followed by local image/text posts; each post opens a reading view with its own comments                                             | No real posts or writes       | One existing shell overlay/history owner                   |
| Local posting       | Text and up to three browser-local images; posts/comments scoped to their topic/post                                                            | Unavailable                   | No upload, API, persistence or public identity fabrication |
| Specials            | Large image-background cards; title, longer abstract and academic metadata overlaid; opens thematic introduction and reading directory          | Existing formal topics        | Accessible text contrast and original tab icon             |
| Internal navigation | Header Back returns from child post/article to its parent topic/special at its previous scroll; browser Back closes the top-level shell overlay | Existing shell behavior       | Browser Back/Forward and source focus handling             |

Scope: new feature-local discussion-preview components, styles and tests; narrow
wiring in home/discussion-screen.tsx, product-preview/t02p-product-preview.tsx
and product-application/product-application.tsx; this specification. Keep the
previous message-center prototype intact. No API, contracts, database, package,
cloud or production deployment change.

Use existing local demonstration illustrations. All copy and heat values are
explicit preview fixtures; they are not real news, research claims or rankings.
Specials' academic appearance does not imply publication or peer review.

Deliver a tested, same-LAN phone preview. Visual/physical-device acceptance and
any Git delivery remain separate. Local image previews remain in browser memory;
closing/reloading the app discards the frontend draft and sample mutations.

The sample Discussion surface is explicitly opt-in: start the development server
with `NEXT_PUBLIC_MOYA_DISCUSSION_PREVIEW=true`. Ordinary development and the
formal API-backed browser smoke retain their existing truthful source states.
Production is excluded independently by `NODE_ENV`. The phone preview also uses
the existing `MOYA_ALLOWED_DEV_ORIGINS` setting for its current LAN address.

## September 20 phone feedback revision

This Owner-requested revision supersedes the permanent inline-comment lock and
Special collection landing page in the first matrix. It remains local and
frontend-only, with no Git/production delivery.

- Lists start directly with their content, without introductory slogans or
  preview notices. Specials place copy at the lower left over a bottom gradient;
  the upper image stays clear; remove directory/action footer labels.
- A Special opens a scholarly article with title, author metadata, clickable
  chapters, body and citation. Once the body is entered, a right dot index
  previews chapter titles while dragging, commits on release inside, cancels
  outside.
- Topics retain 22 ranked text entries, aligned numbers and flame/k heat labels;
  long topic descriptions expand on demand; the replies heading is Exchange.
- Posting is a separate full-screen local composer; rich text remains deferred.
- News comments use the existing bottom composer. Inline comments inhibit side
  entry only while the comment module occupies the viewport; scrolling above
  restores horizontal entry without resetting the reading position.
- Discussion icons use the same direct-SVG approach as the accepted Home fix.
  Existing Home content, artwork and default pager behavior remain unchanged.
- All prototype avatars open the existing official AuthorProfile renderer with
  development-only local data; remove the independently designed message
  profile.

Additional necessary scope: default-permissive gesture guard in shared pager and
its engine; opt-in comment-composer CSS; optional local profile presentation
data in the official author renderer; feature-local profile bridge and fixtures.
Provide plentiful varied virtual examples and a verified same-LAN phone link.

### Revision implementation notes

- All preview avatars reuse `AuthorProfileOverlay` with development-only local
  data. The official profile layout and tabs are retained; fixture reads,
  relationship changes and content remain isolated from real requests and
  account caches. The current-user fixture has no self-follow action.
- Profile return restores the originating control. The old message header is
  inert while the profile is visible. Existing browser Back ownership is
  unchanged.
- Acceptance data now contains 12 conversations, 12 followers, 12 reactions, 22
  ranked topics, 7 posts per topic, 10 initial comments with a reply per content
  item, 8 news articles, and 6 academic articles with 6 chapters each. Refresh
  resets local interactions.
- The direct SVG correction applies only to discussion tab icons. Home content
  and its icon implementation are unchanged.
- Article comments use one persistent comment instance moved between inline and
  side mounts. Drafts and reply state survive mode changes. Returning above the
  inline module re-enables side paging immediately on upward scroll; the
  composer does not resize the reading viewport.
- The optional shared pager gesture guard defaults to permissive behavior.
  Shared comment CSS adds only an opt-in discussion host selector.
- Reference principles:
  [Apple gestures](https://developer.apple.com/design/human-interface-guidelines/gestures),
  [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture),
  and
  [touch action](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action).
  Exact swipe distances and chapter rail geometry are local design choices.

## September 21 phone feedback revision

The Owner's seven annotated screenshots authorize this bounded continuation.
Earlier requirements remain unless replaced below. Delivery is the same local
phone preview, with virtual content and no Git or production publication.

| Scenario            | Development                                                                     | Production                       | Must preserve                                           |
| ------------------- | ------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| Mobile focus        | No tap or focus highlight frames anywhere on phone surfaces                     | Same presentation rule           | Desktop keyboard focus, selected-state indicators       |
| User root           | Persistent search icon opens the existing search surface                        | Same search entry                | Official profile layout, settings and tabs              |
| News cards          | Square cropped images and more compact copy/spacing                             | Existing data source             | Readable text and full article access                   |
| Topic ranking       | Larger top-aligned numbers, clear flame and discussion-count icons              | Existing data source             | 22-item order and read-state greying                    |
| Academic navigation | Compact right dots, magnified active and adjacent title labels during scrubbing | No sample content                | Release-to-jump, leaving active strip cancels           |
| Academic reading    | Interspersed images and comments using the news reader interaction              | No sample content                | One comment instance, drafts and saved reading position |
| Back navigation     | Every child returns to the immediate source, including browser Back             | Existing formal routes preserved | Source scroll, profile reuse and modal ownership        |

Necessary supporting scope includes the root User search entry, global mobile
focus presentation, local child history, shared composer presentation, and
academic reader composition. No dependencies, API, contracts, database or cloud
changes. Physical-phone gesture acceptance remains with the Owner.

## September 21 visual and chapter-navigation follow-up

The latest annotated phone review replaces the uniform News list with an
interleaved presentation: every third item starts a large image card and the two
following items remain compact square-image cards. News cards use elevation
shadow without a separating outline. The Topic rank and academic section numbers
retain their size and alignment with a lighter weight.

The right academic rail begins previewing from any touched dot or gap. During a
drag, the selected chapter is the single largest label and its immediate
neighbors scale symmetrically; the selected chapter changes at the midpoint
between dots. Releasing inside navigates to that chapter, while leaving the rail
cancels the entire gesture even if the pointer later returns.

## September 21 chapter-rail touch correction

The right-side chapter rail uses a full-width invisible touch lane around the
visible dots. Touching any dot or gap starts scrubbing at that position;
vertical movement continuously updates the preview. The selected dot and title
stay uniquely largest while adjacent titles follow the finger with short
Dock-style scale and opacity transitions. Releasing anywhere inside the lane
commits the chapter under the finger, including when the browser coalesces the
final move; leaving the lane cancels the gesture and a later re-entry does not
restore it.
