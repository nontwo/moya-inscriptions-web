const paths = {
  news: "M5 4h15v15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8h2m0-4v15M8 7h9M8 10h4v4H8zM15 10h2M15 14h2M8 17h9",
  discussion:
    "M18 14.5h1a2 2 0 0 1 2 2V21l-3.8-2.5H13a2 2 0 0 1-2-2V15M5.5 4h11A2.5 2.5 0 0 1 19 6.5v5a2.5 2.5 0 0 1-2.5 2.5H9l-5 3v-4A2.5 2.5 0 0 1 3 11V6.5A2.5 2.5 0 0 1 5.5 4Z",
  "academic-cap":
    "M2 9l10-5 10 5-10 5-10-5Zm4 2v6c3.5 3 8.5 3 12 0v-6M22 9v7m0 0-1 3h2l-1-3",
};
// Direct SVG matches the accepted home tab rendering without changing home.
export function DiscussionIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon-renderer="svg"
    >
      <path d={paths[name]} />
    </svg>
  );
}
/*!
 * Flame outline: https://github.com/lucide-icons/lucide/blob/main/icons/flame.svg
 * ISC License. Copyright (c) 2026 Lucide Icons and Contributors.
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */
export function Heat({ value }: { value: number }) {
  const label =
    value >= 1000
      ? `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`
      : String(value);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--yoyi-space-1)",
      }}
      aria-label={`热度 ${label}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4" />
      </svg>
      {label}
    </span>
  );
}

export function DiscussionCount({ value }: { value: number }) {
  return (
    <span
      aria-label={`${value} 条讨论`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--yoyi-space-1)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z" />
        <path d="M7 9h10M7 13h6" />
      </svg>
      {value}
    </span>
  );
}
