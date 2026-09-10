export interface CommentUserPresentation {
  readonly avatarSrc?: string | null;
  readonly id: string;
  readonly name: string;
}

export interface CommentMediaPresentation {
  readonly alt: string;
  readonly id: string;
  readonly kind: "image" | "sticker";
  readonly src: string;
}

export interface CommentReply {
  readonly createdAtLabel: string;
  readonly id: string;
  readonly likeCount: number;
  readonly liked: boolean;
  readonly media?: readonly CommentMediaPresentation[];
  readonly replyToUser?: CommentUserPresentation;
  readonly text: string;
  readonly user: CommentUserPresentation;
}

export interface CommentItem {
  readonly createdAtLabel: string;
  readonly id: string;
  readonly isQaGenerated: boolean;
  readonly likeCount: number;
  readonly liked: boolean;
  readonly media?: readonly CommentMediaPresentation[];
  readonly replies: readonly CommentReply[];
  readonly text: string;
  readonly user: CommentUserPresentation;
}

export interface CommentReplyTarget {
  readonly rootCommentId: string;
  readonly user: CommentUserPresentation;
}
