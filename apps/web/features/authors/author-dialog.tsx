"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@moya/ui";
import type { ReactNode } from "react";
import { requestIdentity } from "../shell/request-identity";

/** A native modal owns one temporary history entry, including browser Back. */
export const AuthorDialog = ({
  title,
  className,
  dirty = false,
  dismissible = true,
  closeRequested = false,
  onClose,
  children,
}: {
  title: string;
  className?: string | undefined;
  dirty?: boolean;
  dismissible?: boolean;
  /** Finish this modal's Back transition before a caller changes the parent view. */
  closeRequested?: boolean;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null),
    latest = useRef({ dirty, dismissible, onClose }),
    closeApproved = useRef(false),
    generation = useRef(0),
    id = useRef(requestIdentity());
  latest.current = { dirty, dismissible, onClose };
  const close = () => {
    if (closeApproved.current || !latest.current.dismissible) return;
    if (latest.current.dirty && !window.confirm("更改尚未保存，放弃这些更改？"))
      return;
    closeApproved.current = true;
    if (window.history.state?.phase4Dialog === id.current)
      window.history.back();
    else latest.current.onClose();
  };
  useEffect(() => {
    if (closeRequested) close();
  }, [closeRequested]);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const marker = id.current;
    const run = ++generation.current;
    if (window.history.state?.phase4Dialog !== marker)
      window.history[
        window.history.state?.phase4Dialog ? "replaceState" : "pushState"
      ](
        { ...window.history.state, phase4Dialog: marker },
        "",
        window.location.href,
      );
    const pop = (event: PopStateEvent) => {
      if (event.state?.phase4Dialog === marker) {
        event.stopImmediatePropagation();
        return;
      }
      event.stopImmediatePropagation();
      if (!latest.current.dismissible) {
        window.history.forward();
        return;
      }
      if (
        !closeApproved.current &&
        latest.current.dirty &&
        !window.confirm("更改尚未保存，放弃这些更改？")
      ) {
        window.history.forward();
        return;
      }
      latest.current.onClose();
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
      // StrictMode replays setup synchronously; only the actual unmount consumes
      // the one modal entry. Swallow its pop so the underlying overlay stays open.
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
        window.history.back();
      });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`phase4-dialog ${className ?? ""}`}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div>
        <header className="phase4-actions">
          <button
            className="phase4-back"
            aria-label="返回"
            type="button"
            onClick={close}
            disabled={!dismissible}
          >
            <Icon aria-hidden="true" name="back" />
          </button>
          <h2>{title}</h2>
        </header>
        {children}
      </div>
    </dialog>
  );
};
