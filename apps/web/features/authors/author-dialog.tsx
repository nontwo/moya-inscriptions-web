"use client";
import { useEffect, useImperativeHandle, useRef } from "react";
import { Icon } from "@moya/ui";
import type { ReactNode, RefObject } from "react";
import { requestIdentity } from "../shell/request-identity";

export interface AuthorDialogNavigationHandle {
  back: () => void;
}

/** A native modal owns its root entry and any explicit child navigation. */
export const AuthorDialog = ({
  title,
  titleContent,
  onBack,
  navigationDepth,
  navigationRef,
  headerHidden = false,
  className,
  dirty = false,
  dismissible = true,
  closeRequested = false,
  onClose,
  children,
}: {
  title: string;
  titleContent?: ReactNode;
  /** Restore the local view represented by the given child depth. */
  onBack?: ((targetDepth: number) => void) | undefined;
  /** Opt in to browser history for local child pages; the modal root is zero. */
  navigationDepth?: number;
  navigationRef?: RefObject<AuthorDialogNavigationHandle | null>;
  className?: string | undefined;
  headerHidden?: boolean;
  dirty?: boolean;
  dismissible?: boolean;
  /** Finish this modal's Back transition before a caller changes the parent view. */
  closeRequested?: boolean;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null),
    latest = useRef({ dirty, dismissible, onClose, onBack, navigationDepth }),
    closeApproved = useRef(false),
    stepApproved = useRef(false),
    pending = useRef(false),
    historyDepth = useRef(0),
    generation = useRef(0),
    id = useRef(requestIdentity());
  latest.current = { dirty, dismissible, onClose, onBack, navigationDepth };
  const allowed = () =>
    latest.current.dismissible &&
    (!latest.current.dirty || window.confirm("更改尚未保存，放弃这些更改？"));
  const close = () => {
    if (pending.current || closeApproved.current || !allowed()) return;
    closeApproved.current = true;
    if (window.history.state?.phase4Dialog === id.current) {
      pending.current = true;
      if (historyDepth.current > 0)
        window.history.go(-historyDepth.current - 1);
      else window.history.back();
    } else latest.current.onClose();
  };
  const back = () => {
    // Preserve older callers whose local Back is deliberately not a child page.
    if (latest.current.navigationDepth === undefined && latest.current.onBack) {
      if (latest.current.dismissible) latest.current.onBack(0);
      return;
    }
    if (historyDepth.current === 0) {
      close();
      return;
    }
    if (pending.current || !allowed()) return;
    pending.current = true;
    stepApproved.current = true;
    window.history.back();
  };
  useImperativeHandle(navigationRef, () => ({ back }));
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const marker = id.current;
    const run = ++generation.current;
    if (window.history.state?.phase4Dialog !== marker)
      window.history[
        window.history.state?.phase4Dialog ? "replaceState" : "pushState"
      ](
        { ...window.history.state, phase4Dialog: marker, phase4DialogDepth: 0 },
        "",
        window.location.href,
      );
    const pop = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      const sameDialog = event.state?.phase4Dialog === marker;
      const targetDepth = sameDialog
        ? Math.max(0, Number(event.state.phase4DialogDepth) || 0)
        : -1;
      if (targetDepth === historyDepth.current) {
        pending.current = false;
        stepApproved.current = false;
        return;
      }
      // Forward must not restore a discarded child without its local state.
      if (targetDepth > historyDepth.current) {
        window.history.go(historyDepth.current - targetDepth);
        return;
      }
      const distance = historyDepth.current - targetDepth;
      if (
        !latest.current.dismissible ||
        (!closeApproved.current && !stepApproved.current && !allowed())
      ) {
        if (distance === 1) window.history.forward();
        else window.history.go(distance);
        return;
      }
      pending.current = false;
      stepApproved.current = false;
      if (sameDialog) {
        historyDepth.current = targetDepth;
        // A successful submit may have already returned the controlled view.
        if (latest.current.navigationDepth !== targetDepth)
          latest.current.onBack?.(targetDepth);
      } else latest.current.onClose();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (latest.current.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("popstate", pop, true);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("popstate", pop, true);
      window.removeEventListener("beforeunload", unload);
      dialog?.close();
      // StrictMode replays setup synchronously. Actual unmount consumes only
      // this modal's entries and shields the underlying page from that pop.
      queueMicrotask(() => {
        if (
          generation.current !== run ||
          window.history.state?.phase4Dialog !== marker
        )
          return;
        const consume = (event: PopStateEvent) => {
          event.stopImmediatePropagation();
          window.removeEventListener("popstate", consume, true);
        };
        window.addEventListener("popstate", consume, true);
        const depth = Number(window.history.state.phase4DialogDepth) || 0;
        if (depth > 0) window.history.go(-depth - 1);
        else window.history.back();
      });
    };
  }, []);
  useEffect(() => {
    if (navigationDepth === undefined) return;
    const depth = Math.max(0, navigationDepth);
    if (depth > historyDepth.current) {
      for (let next = historyDepth.current + 1; next <= depth; next++) {
        window.history.pushState(
          {
            ...window.history.state,
            phase4Dialog: id.current,
            phase4DialogDepth: next,
          },
          "",
          window.location.href,
        );
      }
      historyDepth.current = depth;
    } else if (depth < historyDepth.current && !pending.current) {
      pending.current = true;
      stepApproved.current = true;
      window.history.go(depth - historyDepth.current);
    }
  }, [navigationDepth]);
  useEffect(() => {
    if (closeRequested) close();
  }, [closeRequested]);
  return (
    <dialog
      ref={ref}
      className={`phase4-dialog ${className ?? ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        back();
      }}
    >
      <div>
        <header
          className="phase4-actions"
          inert={headerHidden}
          aria-hidden={headerHidden || undefined}
          style={headerHidden ? { visibility: "hidden" } : undefined}
        >
          <button
            className="phase4-back"
            aria-label="返回"
            type="button"
            onClick={back}
            disabled={!dismissible}
          >
            <Icon aria-hidden="true" name="back" />
          </button>
          <h2>{titleContent ?? title}</h2>
        </header>
        {children}
      </div>
    </dialog>
  );
};
