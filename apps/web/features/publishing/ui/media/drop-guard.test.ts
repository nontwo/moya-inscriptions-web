// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachDropGuard } from "./drop-guard";

import type { DropAvailability } from "./drop-guard";

const drag = (type: string, files: File[] = [], types = ["Files"]) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files, dropEffect: "none" },
  });
  return event as Event & { dataTransfer: { dropEffect: string } };
};

let section: HTMLElement;
let outside: HTMLElement;
let availability: DropAvailability;
let detach: () => void;
const onFiles = vi.fn();
const onRefused = vi.fn();

beforeEach(() => {
  section = document.createElement("div");
  section.innerHTML = "<ol><li><button>第 1 项</button></li></ol>";
  outside = document.createElement("textarea");
  document.body.append(section, outside);
  availability = "accept";
  onFiles.mockReset();
  onRefused.mockReset();
  detach = attachDropGuard(document, {
    root: () => section,
    availability: () => availability,
    onFiles,
    onRefused,
  });
});

afterEach(() => {
  detach();
  document.body.replaceChildren();
});

describe("drop guard", () => {
  it("stages files dropped anywhere in the section", () => {
    const file = new File(["x"], "a.jpg");
    const over = drag("dragover");
    section.querySelector("button")!.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe("copy");
    const drop = drag("drop", [file]);
    section.querySelector("button")!.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("keeps a file dropped elsewhere from opening, without staging it", () => {
    const over = drag("dragover");
    outside.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    expect(over.dataTransfer.dropEffect).toBe("none");
    const drop = drag("drop", [new File(["x"], "a.jpg")]);
    outside.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("leaves text drags alone, also in text fields", () => {
    const over = drag("dragover", [], ["text/plain"]);
    outside.dispatchEvent(over);
    const drop = drag("drop", [], ["text/plain"]);
    outside.dispatchEvent(drop);
    expect(over.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
  });

  it("does not stage what the drop zone already handled, while a dialog is open, or while selection is impossible", () => {
    const handled = drag("drop", [new File(["x"], "a.jpg")]);
    handled.preventDefault();
    section.dispatchEvent(handled);
    expect(onFiles).not.toHaveBeenCalled();

    availability = "blocked";
    section.dispatchEvent(drag("drop", [new File(["x"], "b.jpg")]));
    expect(onFiles).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();

    availability = "disabled";
    const over = drag("dragover");
    section.dispatchEvent(over);
    expect(over.dataTransfer.dropEffect).toBe("none");
    section.dispatchEvent(drag("drop", [new File(["x"], "c.jpg")]));
    expect(onFiles).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(1);
  });

  it("stops listening when detached", () => {
    detach();
    const over = drag("dragover");
    outside.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    detach = () => undefined;
  });
});
