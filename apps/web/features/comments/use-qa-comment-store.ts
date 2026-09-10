"use client";

import { useCallback, useEffect, useReducer } from "react";

import { createQaCommentFixture } from "./comment-scenarios";

import type { QaCommentScenarioName } from "./comment-scenarios";
import type {
  CommentItem,
  CommentReplyTarget,
  CommentUserPresentation,
} from "./comment-types";

interface QaCommentStoreState {
  readonly byCatalogId: Readonly<Record<string, readonly CommentItem[]>>;
  readonly nextLocalSequence: number;
  readonly scenario: QaCommentScenarioName;
}

type QaCommentStoreAction =
  | { readonly scenario: QaCommentScenarioName; readonly type: "reset" }
  | {
      readonly catalogId: string;
      readonly scenario: QaCommentScenarioName;
      readonly text: string;
      readonly type: "send-comment";
      readonly user: CommentUserPresentation;
    }
  | {
      readonly catalogId: string;
      readonly scenario: QaCommentScenarioName;
      readonly target: CommentReplyTarget;
      readonly text: string;
      readonly type: "send-reply";
      readonly user: CommentUserPresentation;
    }
  | {
      readonly catalogId: string;
      readonly commentId: string;
      readonly replyId?: string;
      readonly scenario: QaCommentScenarioName;
      readonly type: "toggle-like";
    };

const itemsFor = (
  state: QaCommentStoreState,
  scenario: QaCommentScenarioName,
  catalogId: string,
) =>
  state.scenario === scenario && state.byCatalogId[catalogId] !== undefined
    ? state.byCatalogId[catalogId]
    : createQaCommentFixture(scenario, catalogId);

const toggledLike = <
  T extends { readonly likeCount: number; readonly liked: boolean },
>(
  item: T,
): T => ({
  ...item,
  likeCount: item.liked ? Math.max(0, item.likeCount - 1) : item.likeCount + 1,
  liked: !item.liked,
});

export const qaCommentStoreReducer = (
  state: QaCommentStoreState,
  action: QaCommentStoreAction,
): QaCommentStoreState => {
  if (action.type === "reset") {
    return {
      byCatalogId: {},
      nextLocalSequence: 1,
      scenario: action.scenario,
    };
  }

  const currentItems = itemsFor(state, action.scenario, action.catalogId);
  const sequence =
    state.scenario === action.scenario ? state.nextLocalSequence : 1;
  const currentCatalogs =
    state.scenario === action.scenario ? state.byCatalogId : {};

  if (action.type === "send-comment") {
    const next: CommentItem = {
      createdAtLabel: "刚刚",
      id: `qa-comment-local-${sequence}`,
      isQaGenerated: true,
      likeCount: 0,
      liked: false,
      replies: [],
      text: action.text,
      user: action.user,
    };
    return {
      byCatalogId: {
        ...currentCatalogs,
        [action.catalogId]: [next, ...currentItems],
      },
      nextLocalSequence: sequence + 1,
      scenario: action.scenario,
    };
  }

  if (action.type === "send-reply") {
    return {
      byCatalogId: {
        ...currentCatalogs,
        [action.catalogId]: currentItems.map((comment) =>
          comment.id === action.target.rootCommentId
            ? {
                ...comment,
                replies: [
                  ...comment.replies,
                  {
                    createdAtLabel: "刚刚",
                    id: `qa-comment-local-${sequence}`,
                    likeCount: 0,
                    liked: false,
                    replyToUser: action.target.user,
                    text: action.text,
                    user: action.user,
                  },
                ],
              }
            : comment,
        ),
      },
      nextLocalSequence: sequence + 1,
      scenario: action.scenario,
    };
  }

  return {
    byCatalogId: {
      ...currentCatalogs,
      [action.catalogId]: currentItems.map((comment) => {
        if (comment.id !== action.commentId) return comment;
        if (action.replyId === undefined) return toggledLike(comment);
        return {
          ...comment,
          replies: comment.replies.map((reply) =>
            reply.id === action.replyId ? toggledLike(reply) : reply,
          ),
        };
      }),
    },
    nextLocalSequence: sequence,
    scenario: action.scenario,
  };
};

export const useQaCommentStore = (scenario: QaCommentScenarioName) => {
  const [state, dispatch] = useReducer(qaCommentStoreReducer, {
    byCatalogId: {},
    nextLocalSequence: 1,
    scenario,
  });

  useEffect(() => dispatch({ scenario, type: "reset" }), [scenario]);

  const getItems = useCallback(
    (catalogId: string) => itemsFor(state, scenario, catalogId),
    [scenario, state],
  );
  const sendComment = useCallback(
    (catalogId: string, text: string, user: CommentUserPresentation) =>
      dispatch({ catalogId, scenario, text, type: "send-comment", user }),
    [scenario],
  );
  const sendReply = useCallback(
    (
      catalogId: string,
      target: CommentReplyTarget,
      text: string,
      user: CommentUserPresentation,
    ) =>
      dispatch({
        catalogId,
        scenario,
        target,
        text,
        type: "send-reply",
        user,
      }),
    [scenario],
  );
  const toggleLike = useCallback(
    (catalogId: string, commentId: string, replyId?: string) =>
      dispatch({
        catalogId,
        commentId,
        ...(replyId === undefined ? {} : { replyId }),
        scenario,
        type: "toggle-like",
      }),
    [scenario],
  );

  return { getItems, sendComment, sendReply, toggleLike };
};
