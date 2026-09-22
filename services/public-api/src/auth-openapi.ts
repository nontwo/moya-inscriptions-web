/** Development-only account authentication reads. Session grants stay off this document. */
const reference = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (description: string, schema: string) => ({
  description,
  content: { "application/json": { schema: reference(schema) } },
});
const failure = (description: string) => ({
  description,
  content: { "application/json": { schema: reference("ApiError") } },
});

export const authPaths = {
  "/v1/community/auth/capabilities": {
    get: {
      operationId: "getAuthCapabilities",
      summary: "Authentication channel capabilities",
      description:
        "Server-owned email and phone availability. A client cannot enable simulation or live delivery. Production does not mount this route in this task.",
      responses: {
        "200": json("The active acceptance profile.", "AuthCapabilities"),
        "400": failure("Invalid query. ApiErrorCode INVALID_QUERY."),
        "500": failure("Internal service error. ApiErrorCode INTERNAL_ERROR."),
        "503": failure(
          "Service unavailable. ApiErrorCode SERVICE_UNAVAILABLE.",
        ),
      },
    },
  },
  "/v1/community/auth/account": {
    get: {
      operationId: "getAuthAccountSecurity",
      summary: "Masked login factors for the current account",
      description:
        "Authenticated account security view. Masked contacts only; no raw email, phone, OTP or session token.",
      security: [{ session: [] }],
      responses: {
        "200": json(
          "The current account's login factors.",
          "AuthAccountSecurity",
        ),
        "400": failure("Invalid query. ApiErrorCode INVALID_QUERY."),
        "401": failure(
          "A valid session is required. ApiErrorCode UNAUTHENTICATED.",
        ),
        "500": failure("Internal service error. ApiErrorCode INTERNAL_ERROR."),
        "503": failure(
          "Service unavailable. ApiErrorCode SERVICE_UNAVAILABLE.",
        ),
      },
    },
  },
};
