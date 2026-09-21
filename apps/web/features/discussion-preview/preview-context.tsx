"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type {
  CommentItem,
  CommentReplyTarget,
} from "../comments/comment-types";
import { previewTopics } from "./preview-data";

export interface PreviewPost {
  id: string;
  author: string;
  text: string;
  images: string[];
  time: string;
}

export interface PreviewCommentLocation {
  readonly topicId: string;
  readonly contentId: string;
  readonly commentId: string;
  readonly rootCommentId: string;
}

interface QueuedPreviewCommentLocation extends PreviewCommentLocation {
  readonly token: number;
}
const initialPosts = () =>
  Object.fromEntries(
    previewTopics.map((topic, index) => [
      topic.id,
      [
        {
          id: `${topic.id}-post-1`,
          author: "秋山",
          text: `关于“${topic.title}”，我想先从自己的记录习惯谈起。\n\n每次到现场，我会先留下一张环境全景，再逐步记录全貌与局部。回去整理时，把观察到的事实和自己的猜想分开写，这样再读时更容易知道哪些地方还需要核对。`,
          images: [
            "/docs/design-system/assets/demo/valley-wall.svg",
            "/docs/design-system/assets/demo/stone-detail.svg",
          ],
          time: "2 小时前",
        },
        {
          id: `${topic.id}-post-2`,
          author: index % 2 ? "观石" : "墨池",
          text: "我也有过相似的疑问。最近尝试把不同时间的笔记并排来看，发现最初忽略的细节，反而是后来最想继续追问的部分。\n\n期待大家分享具体的观察方法。",
          images: [],
          time: "昨天",
        },
        ...["听雨", "一苇", "南窗读帖", "青山与石", "小满"].map(
          (author, offset) => ({
            id: `${topic.id}-post-${offset + 3}`,
            author,
            text: [
              "我习惯先画一张很小的位置草图。回家整理照片时，它比单独的文件名更容易让我想起站在哪里。",
              "补充一个细节：同一处局部最好带上尺度。最近整理旧照片才发现，有些图看得清，却无法准确比较大小。\n\n还会把当天的光线和拍摄方向写下来，隔一段时间再去看时就有了依据。",
              "刚开始整理自己的笔记，先跟着大家学习。",
              "把整体、局部和相邻的字放在一起，很多原来孤立的问题就有了新的线索。下面是我的一组观察记录。",
              "如果不同材料之间有差异，我会先保留各自的描述，等资料更充分时再比较，不急着统一成一个答案。",
            ][offset]!,
            images:
              offset % 2
                ? [
                    "/docs/design-system/assets/demo/ink-album.svg",
                    "/docs/design-system/assets/demo/rubbing-fragment.svg",
                  ]
                : [],
            time: `${offset + 2} 天前`,
          }),
        ),
      ],
    ]),
  );
const commentPeople = [
  "观石",
  "墨池",
  "秋山",
  "听雨",
  "一苇",
  "南窗读帖",
  "青山与石",
  "小满",
  "临池记",
  "松风",
];
const commentTexts = [
  "把观察与解释分开记录，这个方法很值得试一试。",
  "期待看到更多局部之间的比较，也想听听不同的看法。",
  "在现场看和回来看照片，感受确实不一样。",
  "我会把拍摄方向也记录下来。有时候不是石面发生了变化，只是光从另一侧照过来，原先模糊的地方就清楚了。",
  "谢谢分享。",
  "留白的部分也值得仔细看。",
  "能否再补充一张全貌？想看看这处细节在整幅中的位置。",
  "最近也在整理笔记，已经把这个方法记下来了。",
  "我比较喜欢先看整体，再回到某一处转折。",
  "有些疑问留下来，下次再读反而会有新的发现。",
];
export const previewSelf = { id: "preview-reader-self", name: "我" };
const seedComments = (key: string): CommentItem[] =>
  commentPeople.map((name, index) => {
    const articleFixture = key === "news-field-notes";
    const postFixture = key === "thread-1-post-1";
    const actor = index === 0 && articleFixture ? "秋山" : name;
    const selfAuthored = index === 1 && (articleFixture || postFixture);
    const fixtureText =
      index === 0 && articleFixture
        ? "石面上的岁月痕迹也很动人，谢谢你记录下来。"
        : index === 0 && postFixture
          ? "这一笔的收势很有味道。"
          : index === 1 && articleFixture
            ? "字口保存得很好，期待更多细节。"
            : index === 1 && postFixture
              ? "纸墨的质感很美。"
              : commentTexts[index]!;
    return {
      id: `${key}-comment-${index + 1}`,
      createdAtLabel: `${index + 1} 小时前`,
      isQaGenerated: true,
      likeCount: Math.max(0, 7 - index),
      liked: false,
      text: fixtureText,
      user: selfAuthored
        ? previewSelf
        : { id: `preview-reader-${actor}`, name: actor },
      replies:
        index === 1
          ? [
              {
                id: `${key}-reply-1`,
                createdAtLabel: "半小时前",
                likeCount: 2,
                liked: false,
                text: "同意，也想看看不同时间的记录。",
                user: { id: "preview-reader-秋山", name: "秋山" },
              },
            ]
          : [],
    };
  });
function usePreviewState() {
  const [read, setRead] = useState<string[]>([]);
  const [posts, setPosts] =
    useState<Record<string, PreviewPost[]>>(initialPosts);
  const [comments, setComments] = useState<Record<string, CommentItem[]>>({});
  const objectUrls = useRef(new Set<string>());
  const sequence = useRef(0);
  const commentLocationSequence = useRef(0);
  const [commentLocation, setCommentLocation] =
    useState<QueuedPreviewCommentLocation | null>(null);
  const queueCommentLocation = useCallback(
    (location: PreviewCommentLocation) =>
      setCommentLocation({
        ...location,
        token: ++commentLocationSequence.current,
      }),
    [],
  );
  const consumeCommentLocation = useCallback((token: number) => {
    setCommentLocation((current) =>
      current?.token === token ? null : current,
    );
  }, []);
  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    },
    [],
  );
  return {
    read,
    posts,
    commentLocation,
    queueCommentLocation,
    consumeCommentLocation,
    markRead: (id: string) =>
      setRead((old) => (old.includes(id) ? old : [...old, id])),
    createImage: (file: File) => {
      const url = URL.createObjectURL(file);
      objectUrls.current.add(url);
      return url;
    },
    releaseImage: (url: string) => {
      if (objectUrls.current.delete(url)) URL.revokeObjectURL(url);
    },
    addPost: (topicId: string, text: string, images: string[]) => {
      const post = {
        id: `${topicId}-local-${++sequence.current}`,
        author: "我",
        text: text.trim(),
        images,
        time: "刚刚",
      };
      setPosts((old) => ({
        ...old,
        [topicId]: [post, ...(old[topicId] ?? [])],
      }));
      setComments((old) => ({ ...old, [post.id]: [] }));
    },
    commentsFor: (key: string) => comments[key] ?? seedComments(key),
    addComment: (key: string, text: string, reply?: CommentReplyTarget) => {
      const id = `${key}-local-comment-${++sequence.current}`;
      setComments((old) => {
        const items = old[key] ?? seedComments(key);
        return {
          ...old,
          [key]: reply
            ? items.map((item) =>
                item.id === reply.rootCommentId
                  ? {
                      ...item,
                      replies: [
                        ...item.replies,
                        {
                          id,
                          createdAtLabel: "刚刚",
                          likeCount: 0,
                          liked: false,
                          text,
                          user: previewSelf,
                          replyToUser: reply.user,
                        },
                      ],
                    }
                  : item,
              )
            : [
                ...items,
                {
                  id,
                  createdAtLabel: "刚刚",
                  isQaGenerated: true,
                  likeCount: 0,
                  liked: false,
                  replies: [],
                  text,
                  user: previewSelf,
                },
              ],
        };
      });
    },
    toggleLike: (key: string, id: string, replyId?: string) =>
      setComments((old) => ({
        ...old,
        [key]: (old[key] ?? seedComments(key)).map((item) =>
          item.id !== id
            ? item
            : replyId
              ? {
                  ...item,
                  replies: item.replies.map((reply) =>
                    reply.id !== replyId
                      ? reply
                      : {
                          ...reply,
                          liked: !reply.liked,
                          likeCount: reply.likeCount + (reply.liked ? -1 : 1),
                        },
                  ),
                }
              : {
                  ...item,
                  liked: !item.liked,
                  likeCount: item.likeCount + (item.liked ? -1 : 1),
                },
        ),
      })),
  };
}
const PreviewContext = createContext<ReturnType<typeof usePreviewState> | null>(
  null,
);
function PreviewState({ children }: { children: ReactNode }) {
  const value = usePreviewState();
  return (
    <PreviewContext.Provider value={value}>{children}</PreviewContext.Provider>
  );
}
export function DiscussionPreviewProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return enabled ? <PreviewState>{children}</PreviewState> : children;
}
export const useDiscussionPreview = () => useContext(PreviewContext);
