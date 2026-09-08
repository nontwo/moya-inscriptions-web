import Link from "next/link";
import type { ServerProps } from "payload";

export const OwnerWorkflowNavLink = ({ user }: ServerProps) =>
  user?.collection === "users" && user.role === "owner" ? (
    <Link href="/admin/editorial-workflow">批次审核与历史恢复</Link>
  ) : null;
