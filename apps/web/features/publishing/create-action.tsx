"use client";

import searchStyles from "../search/search.module.css";
import styles from "./create-action.module.css";
import { usePublishingEntry } from "./publishing-entry";

/** The author composition's single floating dock action. */
export const CreateWorkAction = () => {
  const { checking, openEditor } = usePublishingEntry();
  return (
    <button
      aria-haspopup="dialog"
      aria-label="发布作品"
      className={`${searchStyles.trigger} ${styles.action}`}
      data-create-work-action=""
      disabled={checking}
      onClick={(event) => openEditor({ type: "new" }, event.currentTarget)}
      type="button"
    >
      {/* Drawn locally: the shared UI icon set is outside this task's scope. */}
      <svg
        aria-hidden="true"
        className={styles.icon}
        data-create-work-icon=""
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M12 5v14m-7-7h14" />
      </svg>
    </button>
  );
};
