"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

import type { RefObject } from "react";

const backgroundSelector =
  "[data-qa-controls], [data-primary-navigation-pager], [data-primary-navigation-dock], [data-primary-navigation], [data-t02p-qa-search], [data-inscription-filter], [data-qa-user-interface], [data-user-trigger]";
const focusableSelector =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]";

interface TargetLock {
  count: number;
  readonly ariaHidden: string | null;
  readonly inert: boolean;
  readonly inertAttribute: string | null;
}

const targetLocks = new Map<HTMLElement, TargetLock>();
const activeModals = new Set<HTMLElement>();
let bodySnapshot: {
  readonly overflow: string;
  readonly scrollX: number;
  readonly scrollY: number;
} | null = null;
let releaseFrame: number | null = null;
let settingsObserver: MutationObserver | null = null;

const restoreBody = () => {
  if (activeModals.size !== 0 || bodySnapshot === null) return;
  const snapshot = bodySnapshot;
  bodySnapshot = null;
  document.body.style.overflow = snapshot.overflow;
  if (
    window.scrollX !== snapshot.scrollX ||
    window.scrollY !== snapshot.scrollY
  ) {
    window.scrollTo(snapshot.scrollX, snapshot.scrollY);
  }
};

const scheduleBodyRelease = (shell: HTMLElement | null) => {
  if (releaseFrame !== null) window.cancelAnimationFrame(releaseFrame);
  releaseFrame = window.requestAnimationFrame(() => {
    releaseFrame = null;
    if (activeModals.size !== 0) return;
    if (shell?.dataset.settingsOpen === "true") {
      settingsObserver?.disconnect();
      settingsObserver = new MutationObserver(() => {
        if (shell.dataset.settingsOpen === "true") return;
        settingsObserver?.disconnect();
        settingsObserver = null;
        scheduleBodyRelease(shell);
      });
      settingsObserver.observe(shell, {
        attributes: true,
        attributeFilter: ["data-settings-open"],
      });
      return;
    }
    restoreBody();
  });
};

const isInteractive = (element: HTMLElement) =>
  !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
  !element.hasAttribute("disabled") &&
  window.getComputedStyle(element).visibility !== "hidden" &&
  window.getComputedStyle(element).display !== "none";

export interface QaModalIsolationOptions {
  readonly open: boolean;
  readonly overlayRef: RefObject<HTMLElement | null>;
  readonly initialFocusRef: RefObject<HTMLElement | null>;
  readonly openerRef: RefObject<HTMLElement | null>;
  readonly onRequestClose: () => void;
  readonly suspended?: boolean;
}

/** Shared only by QA Search/User; ProductShell continues to own Settings. */
export const useQaModalIsolation = ({
  open,
  overlayRef,
  initialFocusRef,
  openerRef,
  onRequestClose,
  suspended = false,
}: QaModalIsolationOptions) => {
  const latest = useRef({ onRequestClose, suspended });
  const restoreOpener = useRef(false);
  const focusFrame = useRef<number | null>(null);

  useLayoutEffect(() => {
    latest.current = { onRequestClose, suspended };
  });

  const close = useCallback(() => {
    restoreOpener.current = true;
    latest.current.onRequestClose();
  }, []);

  useLayoutEffect(() => {
    if (!open || overlayRef.current === null) return;
    const overlay = overlayRef.current;
    const harness = overlay.closest<HTMLElement>("[data-t02p-qa-harness]");
    const shell = overlay.closest<HTMLElement>("[data-product-shell]");
    const targets = Array.from(
      harness?.querySelectorAll<HTMLElement>(backgroundSelector) ?? [],
    ).filter(
      (target) => !target.contains(overlay) && !overlay.contains(target),
    );
    const sourceScroll = Array.from(
      harness?.querySelectorAll<HTMLElement>(
        "[data-primary-destination], [data-home-feed-panel], [data-primary-navigation-pager]",
      ) ?? [],
    ).map((element) => ({
      element,
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    if (releaseFrame !== null) window.cancelAnimationFrame(releaseFrame);
    releaseFrame = null;
    settingsObserver?.disconnect();
    settingsObserver = null;
    if (bodySnapshot === null) {
      bodySnapshot = {
        overflow: document.body.style.overflow,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      };
    }
    activeModals.add(overlay);
    document.body.style.overflow = "hidden";
    for (const target of targets) {
      const existing = targetLocks.get(target);
      if (existing !== undefined) existing.count += 1;
      else {
        targetLocks.set(target, {
          count: 1,
          ariaHidden: target.getAttribute("aria-hidden"),
          inert: target.inert,
          inertAttribute: target.getAttribute("inert"),
        });
        target.inert = true;
        target.setAttribute("inert", "");
        target.setAttribute("aria-hidden", "true");
      }
    }

    const isSuspended = () =>
      latest.current.suspended || shell?.dataset.settingsOpen === "true";
    // The dock trigger also focuses synchronously in the native click path.
    // This handles scenario-driven opens and User without delaying that path.
    if (!isSuspended()) initialFocusRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSuspended() || event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        overlay.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.tabIndex >= 0 && isInteractive(element));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        overlay.focus({ preventScroll: true });
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !overlay.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !overlay.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      activeModals.delete(overlay);
      for (const target of targets) {
        const snapshot = targetLocks.get(target);
        if (snapshot === undefined) continue;
        snapshot.count -= 1;
        if (snapshot.count !== 0) continue;
        target.inert = snapshot.inert;
        if (snapshot.inertAttribute === null) target.removeAttribute("inert");
        else target.setAttribute("inert", snapshot.inertAttribute);
        if (snapshot.ariaHidden === null) target.removeAttribute("aria-hidden");
        else target.setAttribute("aria-hidden", snapshot.ariaHidden);
        targetLocks.delete(target);
      }
      sourceScroll.forEach(({ element, left, top }) => {
        if (element.scrollLeft !== left) element.scrollLeft = left;
        if (element.scrollTop !== top) element.scrollTop = top;
      });
      scheduleBodyRelease(shell);
    };
  }, [close, initialFocusRef, open, overlayRef]);

  useLayoutEffect(() => {
    if (open || !restoreOpener.current) return;
    restoreOpener.current = false;
    focusFrame.current = window.requestAnimationFrame(() => {
      focusFrame.current = null;
      const opener = openerRef.current;
      if (
        activeModals.size === 0 &&
        opener?.isConnected &&
        isInteractive(opener)
      ) {
        opener.focus({ preventScroll: true });
      }
    });
    return () => {
      if (focusFrame.current !== null)
        window.cancelAnimationFrame(focusFrame.current);
      focusFrame.current = null;
    };
  }, [open, openerRef]);

  return { close };
};
