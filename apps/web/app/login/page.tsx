import { notFound } from "next/navigation";

import { AuthFlow } from "../../features/auth/auth-flow";
import { safeReturnPath } from "../../features/auth/auth-api";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams?: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = (await searchParams) ?? {};
  const returnTo = safeReturnPath(
    typeof query.return === "string" ? query.return : "/",
  );
  return <AuthFlow mode="sign-in" returnTo={returnTo} />;
}
