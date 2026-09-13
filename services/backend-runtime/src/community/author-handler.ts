import { createHash, randomUUID } from "node:crypto";
import { validateAuthorPng } from "./author-png.js";
import {
  isCommunityConflictError,
  parseCommentListingQuery,
  isCommunityInputError,
  isCommunityNotFoundError,
} from "@moya/api";
import {
  authorListQuerySchema,
  discoveryQuerySchema,
  contentIdentitySchema,
  commentLikeUpdateSchema,
  createCatalogCommentReplyRequestSchema,
  catalogCommentIdSchema,
  avatarUpdateSchema,
  contentRelationUpdateSchema,
  guestFavoriteMergeSchema,
  privacyUpdateSchema,
  profileUpdateSchema,
  relationshipUpdateSchema,
  requestIdentitySchema,
  workDraftApplySchema,
  workDraftSaveSchema,
} from "@moya/contracts/schemas";
import { sendApiError } from "../http/api-error-response.js";
import { JsonBodyError, readJsonBody } from "../http/json-body.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";
import { readBearerToken } from "./session-credential.js";
import type {
  AuthorCommunityService,
  CommunitySessionService,
} from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

const noStore = { "cache-control": "private, no-store", vary: "Authorization" };
class Unauthorized extends Error {}
class InvalidInput extends Error {}
const parsed = <T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new InvalidInput();
  return result.data;
};
/** Called only from the Development environment composition. */
export const handleAuthorRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  service: AuthorCommunityService,
  sessions: CommunitySessionService,
): Promise<void> => {
  try {
    const url = new URL(request.url ?? "/", "http://request.invalid");
    const path = url.pathname.slice("/v1/community/".length).split("/");
    const token = readBearerToken(request);
    if (request.headers.authorization !== undefined && token === undefined)
      throw new Unauthorized();
    const session = token === undefined ? null : await sessions.identify(token);
    if (token !== undefined && session === null) throw new Unauthorized();
    const viewer = session?.id ?? null;
    const requireActor = () => {
      if (viewer === null) throw new Unauthorized();
      const expected = request.headers["x-author-account"];
      if (
        request.method !== "GET" &&
        expected !== undefined &&
        expected !== viewer
      )
        throw new Unauthorized();
      return viewer;
    };
    const method = request.method;
    const reply = (value: unknown, status = 200) =>
      sendJson(response, status, value, noStore);
    const query = () => {
      if (
        [...url.searchParams.keys()].some(
          (key) => key !== "page" && key !== "pageSize",
        )
      )
        throw new InvalidInput();
      return parsed(
        authorListQuerySchema,
        collectTransportQuery(url.searchParams),
      );
    };
    const listing = () => {
      const raw = collectTransportQuery(url.searchParams);
      if (raw.pinned === "") {
        const { pinned: empty, ...rest } = raw;
        void empty;
        return { ...parseCommentListingQuery(rest), pinned: [] };
      }
      return parseCommentListingQuery(raw);
    };
    const body = async () => {
      if (url.search) throw new InvalidInput();
      return readJsonBody(request, 100000);
    };
    if (method === "GET" && path.join("/") === "discover") {
      const raw = collectTransportQuery(url.searchParams),
        keys = ["kind", "pageSize", "filters", "sequence", "after", "search"];
      if (
        Object.keys(raw).some((k) => !keys.includes(k)) ||
        Object.values(raw).some((v) => typeof v !== "string")
      )
        throw new InvalidInput();
      let filters: unknown;
      try {
        filters =
          raw.filters === undefined
            ? undefined
            : JSON.parse(raw.filters as string);
      } catch {
        throw new InvalidInput();
      }
      for (const name of ["pageSize", "after"] as const) {
        if (
          raw[name] !== undefined &&
          !/^(0|[1-9]\d*)$/u.test(raw[name] as string)
        )
          throw new InvalidInput();
      }
      const q = parsed(discoveryQuerySchema, {
        ...raw,
        ...(filters === undefined ? {} : { filters }),
        ...(raw.pageSize === undefined
          ? {}
          : { pageSize: Number(raw.pageSize) }),
        ...(raw.after === undefined ? {} : { after: Number(raw.after) }),
      });
      reply(await service.browse(viewer, q));
      return;
    }
    if (
      method === "GET" &&
      path.join("/") === "filter-options" &&
      service.discovery
    ) {
      if (url.search) throw new InvalidInput();
      reply(await service.discovery.filterOptions());
      return;
    }
    if (
      method === "GET" &&
      path.length === 4 &&
      path[0] === "content" &&
      (path[1] === "catalog" || path[1] === "work") &&
      path[2] &&
      (path[3] === "card" || path[3] === "state")
    ) {
      if (url.search) throw new InvalidInput();
      let id: string;
      try {
        id = decodeURIComponent(path[2]);
      } catch {
        throw new InvalidInput();
      }
      const target = parsed(contentIdentitySchema, { type: path[1], id });
      if (path[3] === "card") {
        reply(await service.card(target, viewer));
        return;
      }
      const actor = requireActor();
      await service.assertTarget(target, actor);
      if (!service.discovery) throw new InvalidInput();
      reply(await service.discovery.state(target, actor));
      return;
    }
    if (
      method === "GET" &&
      path.length === 3 &&
      path[0] === "authors" &&
      path[1] &&
      (path[2] === "favorites" || path[2] === "likes")
    ) {
      const raw = collectTransportQuery(url.searchParams);
      const q = parsed(authorListQuerySchema, raw);
      reply(
        await service.collection(
          path[1],
          viewer,
          path[2] === "favorites" ? "favorite" : "like",
          q,
        ),
      );
      return;
    }
    if (service.discussion && path[0] === "discussion") {
      const discussion = service.discussion;
      if (
        path[1] === "items" &&
        path[2] &&
        path.length === 4 &&
        (path[3] === "like" || path[3] === "body")
      ) {
        const actor = requireActor(),
          id = parsed(catalogCommentIdSchema, path[2]);
        if (method === "POST" && path[3] === "like") {
          const input = parsed(commentLikeUpdateSchema, await body());
          await service.commentLike(actor, id, input.enabled, input.requestId);
          reply({ saved: true });
          return;
        }
        if (method === "DELETE" && path[3] === "body") {
          await discussion.deleteDiscussionBody(
            actor,
            id,
            parsed(requestIdentitySchema, await body()).requestId,
          );
          reply({ deleted: true });
          return;
        }
      }
      if ((path[1] === "catalog" || path[1] === "work") && path[2]) {
        let decoded: string;
        try {
          decoded = decodeURIComponent(path[2]);
        } catch {
          throw new InvalidInput();
        }
        const target = parsed(contentIdentitySchema, {
          type: path[1],
          id: decoded,
        });
        await service.assertTarget(target, viewer);
        if (method === "GET" && path.length === 3) {
          reply(await discussion.readDiscussion(target, viewer, listing()));
          return;
        }
        if (
          method === "GET" &&
          path.length === 5 &&
          path[3] === "locate" &&
          path[4]
        ) {
          reply(
            await discussion.locateDiscussion(
              target,
              parsed(catalogCommentIdSchema, path[4]),
              requireActor(),
              listing(),
            ),
          );
          return;
        }
        const root =
          path.length === 5 && path[3] === "replies" && path[4]
            ? parsed(catalogCommentIdSchema, path[4])
            : undefined;
        if (root && method === "GET") {
          reply(
            await discussion.readDiscussionReplies(
              target,
              root,
              viewer,
              query(),
            ),
          );
          return;
        }
        if (method === "POST" && (path.length === 3 || root)) {
          const actor = requireActor(),
            input = parsed(
              createCatalogCommentReplyRequestSchema,
              await body(),
            );
          if (!root && input.replyTo) throw new InvalidInput();
          reply(
            await discussion.submitDiscussion(
              target,
              actor,
              input.text,
              root,
              input.replyTo,
            ),
            201,
          );
          return;
        }
      }
    }
    if (method === "GET" && path.join("/") === "me/comments") {
      reply(await service.ownComments(requireActor(), query()));
      return;
    }
    if (method === "GET" && path[0] === "authors" && path[1]) {
      if (path.length === 2) {
        if (url.search) throw new InvalidInput();
        reply(await service.profile(path[1], viewer));
        return;
      }
      if (path.length === 3 && path[2] === "works") {
        reply(await service.port.listWorks(path[1], viewer, query()));
        return;
      }
      if (
        path.length === 3 &&
        (path[2] === "following" || path[2] === "followers")
      ) {
        reply(await service.port.listPeople(path[1], viewer, path[2], query()));
        return;
      }
    }
    if (path[0] === "me" && path.length === 2) {
      const actor = requireActor();
      if (method === "GET" && path[1] === "blocks") {
        reply(await service.port.listPeople(actor, actor, "blocks", query()));
        return;
      }
      if (method === "POST") {
        const value = await body();
        if (path[1] === "profile") {
          await service.port.updateProfile(
            actor,
            parsed(profileUpdateSchema, value),
          );
          reply({ saved: true });
          return;
        }
        if (path[1] === "privacy") {
          await service.port.updatePrivacy(
            actor,
            parsed(privacyUpdateSchema, value),
          );
          reply({ saved: true });
          return;
        }
        if (path[1] === "avatar") {
          reply(
            await service.port.updateAvatar(
              actor,
              parsed(avatarUpdateSchema, value),
            ),
          );
          return;
        }
      }
    }
    if (method === "POST" && path[0] === "relationships" && path.length === 2) {
      const actor = requireActor(),
        input = parsed(relationshipUpdateSchema, await body());
      if (path[1] === "follow") {
        await service.port.follow(actor, input);
        reply({ saved: true });
        return;
      }
      if (path[1] === "block") {
        await service.port.block(actor, input);
        reply({ saved: true });
        return;
      }
    }
    if (
      method === "POST" &&
      path[0] === "content" &&
      path.length === 2 &&
      (path[1] === "favorite" || path[1] === "like")
    ) {
      const actor = requireActor();
      await service.relation(
        actor,
        path[1],
        parsed(contentRelationUpdateSchema, await body()),
      );
      reply({ saved: true });
      return;
    }
    if (method === "POST" && path.join("/") === "favorites/merge") {
      const actor = requireActor();
      reply(
        await service.port.mergeGuestFavorites(
          actor,
          parsed(guestFavoriteMergeSchema, await body()),
        ),
      );
      return;
    }
    if (path[0] === "works" && path[1]) {
      const id = path[1];
      if (path.length === 2 && method === "GET") {
        if (url.search) throw new InvalidInput();
        reply(await service.port.readWork(id, viewer));
        return;
      }
      const actor = requireActor();
      if (path.length === 2 && method === "DELETE") {
        await service.port.deleteWork(
          actor,
          id,
          parsed(requestIdentitySchema, await body()).requestId,
        );
        reply({ deleted: true });
        return;
      }
      if (path.length === 3 && path[2] === "drafts") {
        if (method === "GET") {
          reply(await service.port.listDrafts(actor, id, query()));
          return;
        }
        if (method === "POST") {
          reply(
            await service.port.saveDraft(
              actor,
              id,
              parsed(workDraftSaveSchema, await body()),
            ),
          );
          return;
        }
      }
      if (path.length === 4 && path[2] === "drafts") {
        if (path[3] === "apply" && method === "POST") {
          reply(
            await service.port.applyDraft(
              actor,
              id,
              parsed(workDraftApplySchema, await body()),
            ),
          );
          return;
        }
        if (method === "DELETE" && path[3]) {
          await service.port.discardDraft(
            actor,
            id,
            path[3],
            parsed(requestIdentitySchema, await body()).requestId,
          );
          reply({ discarded: true });
          return;
        }
      }
    }
    if (path[0] === "media") {
      if (path.length === 1 && method === "POST") {
        const actor = requireActor();
        const uploadRequest = parsed(requestIdentitySchema, {
          requestId: request.headers["x-request-id"],
        }).requestId;
        if (url.search || request.headers["content-type"] !== "image/png")
          throw new InvalidInput();
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const b = Buffer.from(chunk);
          size += b.length;
          if (size > 4194304) throw new InvalidInput();
          chunks.push(b);
        }
        const bytes = Buffer.concat(chunks);
        const dimensions = validateAuthorPng(bytes);
        reply(
          await service.port.saveMedia({
            requestId: uploadRequest,
            id: `user-media-${randomUUID().replaceAll("-", "")}`,
            ownerId: actor,
            bytes,
            ...dimensions,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          }),
          201,
        );
        return;
      }
      if (path.length === 2 && path[1] && method === "GET") {
        if (url.search) throw new InvalidInput();
        const media = await service.port.readMedia(path[1], viewer);
        if (!media) {
          sendApiError(response, "ITEM_NOT_FOUND", "Media is unavailable");
          return;
        }
        response.writeHead(200, {
          ...noStore,
          "content-type": "image/png",
          "content-length": media.bytes.byteLength,
          "x-content-type-options": "nosniff",
        });
        response.end(media.bytes);
        return;
      }
    }
    sendApiError(response, "ITEM_NOT_FOUND", "Not found");
  } catch (error) {
    if (error instanceof Unauthorized)
      sendApiError(response, "UNAUTHENTICATED", "A valid session is required");
    else if (
      error instanceof InvalidInput ||
      error instanceof JsonBodyError ||
      isCommunityInputError(error)
    )
      sendApiError(response, "INVALID_INPUT", "Invalid community input");
    else if (isCommunityNotFoundError(error))
      sendApiError(response, "ITEM_NOT_FOUND", "This item is unavailable");
    else if (isCommunityConflictError(error))
      sendApiError(response, "CONFLICT", error.message);
    else
      sendApiError(
        response,
        "SERVICE_UNAVAILABLE",
        "Community service is temporarily unavailable",
      );
  }
};
