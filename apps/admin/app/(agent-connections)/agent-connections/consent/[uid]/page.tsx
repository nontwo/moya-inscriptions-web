import Link from "next/link";
import { notFound } from "next/navigation";

// Imported from the two modules directly, never from the package barrel: the
// barrel re-exports the endpoints and the control-plane runtime, and pulling
// `payload` and `pg` into a page whose whole job is to be unprivileged would
// make this the most capable page in the flow instead of the least.
import { connectionsEnabled } from "../../../../../src/agent-connections/composition";
import {
  consentReviewPath,
  interactionUidSchema,
} from "../../../../../src/agent-connections/consent";

/**
 * The consent LANDING. It authorizes nothing.
 *
 * This is the page the provider's redirect arrives at, and it is deliberately
 * the least capable page in the product:
 *
 *   * it authenticates nobody, because on this navigation the browser withheld
 *     the `SameSite=Strict` Owner cookie and no redirect chain changes that;
 *   * it reads no database and reveals nothing about the interaction beyond
 *     the fact that the uid is well formed, so a guessed uid learns nothing;
 *   * its only control is a link the HUMAN clicks. That click is a same-origin
 *     navigation the browser DOES send the cookie on (measured), which is why
 *     it is a step somebody takes rather than a redirect this page performs.
 *
 * An automatic redirect here would be the untested "same-site bounce" — it
 * would be initiated by the cross-site chain rather than by the Admin origin,
 * and the measurement that says the cookie comes back does not cover it.
 */
export default async function ConsentLandingPage({
  params,
}: {
  readonly params: Promise<{ readonly uid: string }>;
}) {
  if (!connectionsEnabled()) notFound();
  const { uid } = await params;
  const interaction = interactionUidSchema.safeParse(uid);
  if (!interaction.success) notFound();

  return (
    <main
      data-agent-consent-landing={interaction.data}
      style={{
        fontFamily: "system-ui, sans-serif",
        margin: "0 auto",
        maxWidth: "36rem",
        padding: "3rem 1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.25rem" }}>继续授权 AI 连接</h1>
      <p>
        一个应用请求以只读方式访问 ArtVenn。请在管理端确认这次请求的具体内容，
        然后决定是否同意。
      </p>
      <p>
        <strong>这一页不会授权任何事情。</strong>
        点击下面的链接后，管理端会验证你的 Owner 登录状态并显示完整详情。
      </p>
      <p>
        <Link
          data-agent-consent-continue
          href={consentReviewPath(interaction.data)}
        >
          在管理端继续
        </Link>
      </p>
    </main>
  );
}
