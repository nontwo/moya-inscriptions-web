import {
  useEffect,
  useId,
  useRef,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cx } from "../utils.js";
import { Icon } from "./brand.js";
import { IconButton } from "./primitives.js";

type OverlayPanelProps = {
  variant: "dialog" | "drawer" | "sheet";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
  className?: string;
};

function OverlayPanel({
  variant,
  open,
  onOpenChange,
  title,
  description,
  children,
  closeLabel = "关闭",
  className,
}: OverlayPanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }
  }, [open]);

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onOpenChange(false);
  };

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      aria-modal="true"
      className={cx(
        "yoyi-overlay-panel",
        `yoyi-overlay-panel--${variant}`,
        className,
      )}
      data-yoyi-ui={variant}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={handleBackdropClick}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      ref={dialogRef}
    >
      <div className="yoyi-overlay-panel__surface">
        <header className="yoyi-overlay-panel__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <IconButton
            icon={<Icon name="close" />}
            label={closeLabel}
            onClick={() => onOpenChange(false)}
          />
        </header>
        <div className="yoyi-overlay-panel__content">{children}</div>
      </div>
    </dialog>
  );
}

export type DialogProps = Omit<OverlayPanelProps, "variant">;

export function Dialog(props: DialogProps) {
  return <OverlayPanel {...props} variant="dialog" />;
}

export type DrawerProps = Omit<OverlayPanelProps, "variant"> & {
  side?: "start" | "end";
};

export function Drawer({ side = "end", className, ...props }: DrawerProps) {
  return (
    <OverlayPanel
      {...props}
      className={cx(`yoyi-overlay-panel--${side}`, className)}
      variant="drawer"
    />
  );
}

export type SheetProps = Omit<OverlayPanelProps, "variant">;

export function Sheet(props: SheetProps) {
  return <OverlayPanel {...props} variant="sheet" />;
}

export type TooltipProps = HTMLAttributes<HTMLSpanElement> & {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom";
};

export function Tooltip({
  content,
  children,
  placement = "top",
  className,
  ...props
}: TooltipProps) {
  const tooltipId = useId();

  return (
    <span
      {...props}
      aria-describedby={tooltipId}
      className={cx("yoyi-tooltip", className)}
      data-placement={placement}
      data-yoyi-ui="tooltip"
      tabIndex={0}
    >
      {children}
      <span className="yoyi-tooltip__bubble" id={tooltipId} role="tooltip">
        {content}
      </span>
    </span>
  );
}
