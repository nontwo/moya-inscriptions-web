"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AuthorProfile } from "@moya/contracts";
import type { ProfileProductHistoryState } from "../product-shell/product-history";
import { useProductShell } from "../product-shell/product-shell";
import { requestIdentity } from "../shell/request-identity";
import { AuthorProfileOverlay } from "./author-profile";

interface PreviewAuthorProfileProps {
  readonly name: string;
  readonly onClose: () => void;
  readonly followed?: boolean | undefined;
  readonly onFollowChange?: ((enabled: boolean) => void) | undefined;
  readonly insideDialog?: boolean | undefined;
}

/** Local presentation data in the existing author page; the caller owns Back. */
export function PreviewAuthorProfile(props: PreviewAuthorProfileProps) {
  if (process.env.NODE_ENV !== "development") return null;
  return <ScopedPreviewAuthorProfile key={props.name} {...props} />;
}

function ScopedPreviewAuthorProfile({
  name,
  onClose,
  followed,
  onFollowChange,
  insideDialog = false,
}: PreviewAuthorProfileProps) {
  const shell = useProductShell();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [authorId] = useState(
    () => `user-${requestIdentity().replaceAll("-", "")}`,
  );
  const [state, setState] = useState<ProfileProductHistoryState>(() => ({
    kind: "profile",
    version: 2,
    authorId,
    entryId: `preview-profile-${requestIdentity()}`,
    tab: "works",
    profileScrollTop: 0,
    sourceDestination: shell.activeDestination,
    sourceScrollTop: 0,
  }));
  const [following, setFollowing] = useState(followed ?? false);
  useEffect(() => {
    if (followed !== undefined) setFollowing(followed);
  }, [followed]);
  useLayoutEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, []);
  const displayName =
    name
      .trim()
      .slice(0, 40)
      .replaceAll("\u0000", "")
      .replace(/[\uD800-\uDFFF]/gu, "")
      .trim() || "示例作者";
  const profile = useMemo<AuthorProfile>(
    () => ({
      id: authorId,
      handle: `preview-${authorId.slice(-8)}`,
      displayName,
      bio: "分享读帖、访碑与日常观察。",
      avatar: null,
      background: null,
      isOwner: false,
      following,
      privacy: {
        following: "private",
        followers: "private",
        favorites: "public",
        likes: "public",
      },
      totals: {
        works: 0,
        following: null,
        followers: null,
        favorites: 0,
        likes: 0,
      },
      nextAvatarChangeAt: null,
    }),
    [authorId, displayName, following],
  );
  return (
    <AuthorProfileOverlay
      state={state}
      backButtonRef={backButtonRef}
      onClose={onClose}
      onViewChange={(tab, profileScrollTop) =>
        setState((old) =>
          old.tab === tab && old.profileScrollTop === profileScrollTop
            ? old
            : { ...old, tab, profileScrollTop },
        )
      }
      insideDialog={insideDialog}
      preview={{
        profile,
        self: name === "我",
        onFollowChange: (enabled) => {
          setFollowing(enabled);
          onFollowChange?.(enabled);
        },
      }}
    />
  );
}
