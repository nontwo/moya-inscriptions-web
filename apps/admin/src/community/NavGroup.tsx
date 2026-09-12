"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavGroup, useAuth } from "@payloadcms/ui";

import styles from "./community.module.css";

/**
 * Work-oriented navigation for the Owner: the Community group (queue,
 * publication setting, operation history) and the automation tools group
 * (the editorial batch workflow). Rendered inside Payload's own sidebar
 * through `afterNavLinks`, so the built-in collection groups stay intact.
 */
const groups = [
  {
    label: "社区",
    links: [
      { href: "/admin/community-moderation", label: "评论审核队列" },
      { href: "/admin/community-moderation/settings", label: "发布设置" },
      { href: "/admin/community-moderation/history", label: "操作历史" },
    ],
  },
  {
    label: "自动化工具",
    links: [{ href: "/admin/editorial-workflow", label: "编辑批处理工作流" }],
  },
] as const;

export const CommunityNavGroups = () => {
  const { user } = useAuth();
  const pathname = usePathname();
  if (user?.collection !== "users" || user.role !== "owner") return null;
  return (
    <>
      {groups.map((group) => (
        <NavGroup isOpen key={group.label} label={group.label}>
          {group.links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`nav__link ${styles.navLink}${active ? " nav__link--active" : ""}`}
                data-community-nav={link.href}
                href={link.href}
                key={link.href}
              >
                {active ? <span className="nav__link-indicator" /> : null}
                <span className="nav__link-label">{link.label}</span>
              </Link>
            );
          })}
        </NavGroup>
      ))}
    </>
  );
};
