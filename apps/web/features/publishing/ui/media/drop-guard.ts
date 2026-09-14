/**
 * File drops while the media section is shown (Q02). The drop zone handles
 * drops on itself; this guard, on the document, makes sure a file dropped
 * anywhere else never opens in place of the editor (which would leave it and
 * lose a no-save session), and sends files dropped anywhere in the media
 * section (strip, notices, staged list) to the same staging. Only drags that
 * carry files are touched: dragging text into a text field keeps working.
 */

export type DropAvailability = "accept" | "disabled" | "blocked";

export interface DropGuardOptions {
  /** The media section: drops inside it are staged. */
  readonly root: () => Element | null;
  /** `blocked` while a modal dialog is open; `disabled` while selection is impossible. */
  readonly availability: () => DropAvailability;
  readonly onFiles: (files: File[]) => void;
  /** A drop inside the section while selection is impossible. */
  readonly onRefused?: () => void;
}

export const carriesFiles = (event: DragEvent): boolean =>
  Array.from(event.dataTransfer?.types ?? []).includes("Files");

export const attachDropGuard = (
  target: Pick<Document, "addEventListener" | "removeEventListener">,
  options: DropGuardOptions,
): (() => void) => {
  const inside = (event: Event) => {
    const root = options.root();
    return (
      root !== null &&
      typeof Node !== "undefined" &&
      event.target instanceof Node &&
      root.contains(event.target)
    );
  };
  const accepts = (event: Event) =>
    inside(event) && options.availability() === "accept";

  const over = (event: Event) => {
    const drag = event as DragEvent;
    if (!carriesFiles(drag)) return;
    // Cancelling marks the page as the drop target: the browser does not open the file.
    drag.preventDefault();
    if (drag.dataTransfer)
      drag.dataTransfer.dropEffect = accepts(drag) ? "copy" : "none";
  };
  const drop = (event: Event) => {
    const drag = event as DragEvent;
    if (!carriesFiles(drag)) return;
    // Already staged by the drop zone.
    const handled = drag.defaultPrevented;
    drag.preventDefault();
    if (handled || !inside(drag)) return;
    const availability = options.availability();
    if (availability === "blocked") return;
    if (availability === "disabled") {
      options.onRefused?.();
      return;
    }
    const files = Array.from(drag.dataTransfer?.files ?? []);
    if (files.length > 0) options.onFiles(files);
  };

  target.addEventListener("dragenter", over);
  target.addEventListener("dragover", over);
  target.addEventListener("drop", drop);
  return () => {
    target.removeEventListener("dragenter", over);
    target.removeEventListener("dragover", over);
    target.removeEventListener("drop", drop);
  };
};
