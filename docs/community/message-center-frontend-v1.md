# Message center frontend preview

The Owner's September 20 reference annotations authorize a frontend-only message
preview. The existing message entry opens it automatically in Development, with
an explicit preview label. No message API, persisted notifications, follower
mutation, public identity, or backend integration is introduced.

| Scenario             | Development                                                                                | Production                        | Must preserve                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ | --------------------------------- | -------------------------------------------------------------------- |
| Main                 | Fans with unread badge, combined likes/saves, comments; avatar/name conversation rows      | Existing message center           | Existing supplied entry badge and account scoping                    |
| Conversation actions | Left swipe or accessible More button reveals mute, hide, delete; removal offers Undo       | No synthetic operations           | Vertical scrolling and keyboard access                               |
| Likes/saves          | Actor, action and time only                                                                | Existing empty states             | No unrelated recommendation/share controls                           |
| Comments             | Received/sent pills, actor, text and work title                                            | Existing authenticated MyComments | Existing profile comments                                            |
| Fans                 | Follow-back toggle, avatar/name and chevron open a local sample profile                    | No synthetic users                | No real follow/profile requests                                      |
| Private conversation | Local draft and locally appended message; explicitly preview-only                          | No new messaging functionality    | Plain text rendering; no persistence or network                      |
| Navigation           | Header Back returns to the preceding preview screen; browser Back/Escape closes the center | Existing dialog behavior          | One modal history owner and focus restoration                        |
| Lifecycle            | State lasts while this preview is open, resets on close/reopen or account change           | Existing session boundaries       | No synthetic data written into author context, local storage or APIs |

The screenshots are visual references; names, notifications and photographs from
the screenshots are not imported. Character avatars use the existing design
tokens. All sample actors are presentation-local, without runtime identity IDs.

Scope: message-center entry, local message-preview component/styles/tests and
the optional header Back action on AuthorDialog. Production retains the previous
message center until real integration is separately authorized. No dependencies,
shared contracts, services, migrations or deployment configuration change.

Owner visual and physical-device acceptance remain pending. Local automated
checks and browser previews do not constitute acceptance or merge authority.

## September 20 phone feedback revision

Compress category spacing and remove explanatory preview/gesture labels. Replace
release-only row shifting with continuous pointer tracking and staged circular
icon actions: Delete first at the trailing edge, then Mute. Remove Hide and the
ellipsis trigger. Keep keyboard ArrowLeft/Right/Escape access, cancellation,
reduced motion and local undo. Show muted state as an icon. Reuse the official
AuthorProfile presentation for every avatar, with local development data only.
Generate additional varied conversation/activity fixtures for phone acceptance.

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

The latest explicit Owner feedback replaces the old modal-only browser Back
behavior and visible category labels. The task remains local frontend-only.

| Scenario      | Development                                                                                                         | Production                                    | Must preserve                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| Navigation    | Header and browser Back return one level: profile/chat/activity to source, activity to messages, messages to opener | Existing formal dialog behavior unless opt-in | Dirty guards, focus/scroll restoration                  |
| Swipe actions | Native touch starts inside nested row controls; capture transfer must not cancel the drag                           | No sample operations                          | Vertical scroll, trash-then-mute, cancellation and Undo |
| Categories    | Icons and unread badges only; names remain accessible                                                               | Existing data                                 | Fans, likes/saves and comments destinations             |
| Fans          | Equal-size pill buttons for follow-back and mutual states                                                           | Existing data                                 | Local follow toggle and official profile navigation     |
| Chat          | Clickable avatar beside header nickname, no extra profile row; fixed bottom shared-style input                      | No messaging backend                          | Plain local text, official profile reuse                |

No alternate profile screen, network mutation or persisted messaging is added.

## September 21 interaction follow-up

The latest phone review keeps the existing two-action swipe model and adds two
bounded presentation rules. An open or actively dragged row closes as soon as a
vertical gesture or list scroll begins, including when the gesture starts on a
different row or exposed action. Delete, restore and mute notices use a compact
pill presentation and dismiss after four seconds; delete remains undoable only
while that notice is visible. Keyboard access, reduced motion, local-only state
and the production boundary remain unchanged.

## September 21 comment-location follow-up

Received and sent comment activities carry an explicit development-only location
for the original article or topic post, its root comment and the exact comment.
Selecting an available activity fully closes the message center before opening
the original content, expands the relevant reply group when necessary, and
centers the exact comment with a brief background fade. Avatars remain separate
controls that open the existing official profile presentation.

Returning from that content restores the primary destination where the message
center was opened, then reopens the same received or sent comment tab. The next
Back returns to the message overview, preserving the one-level navigation model.

When the original post or the reply's root comment is absent, the activity shows
the exact text `内容不可见` and exposes no navigation control. No synthetic
activity state is persisted or sent to a backend.
