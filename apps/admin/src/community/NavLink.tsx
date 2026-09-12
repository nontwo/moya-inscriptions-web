import Link from "next/link";
import type { ServerProps } from "payload";

export const CommunityModerationNavLink = ({ user }: ServerProps) =>
  user?.collection === "users" && user.role === "owner" ? (
    <Link href="/admin/community-moderation">社区评论与发布策略</Link>
  ) : null;
