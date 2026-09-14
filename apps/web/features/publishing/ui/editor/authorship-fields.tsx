"use client";

import { useId } from "react";

import {
  originalAuthorRule,
  referenceTitleRule,
  sourceNoteRule,
} from "./editor-text";
import { TextField } from "./text-field";
import styles from "./editor.module.css";

import type {
  EditorSessionState,
  EditorSessionStore,
  ReferenceField,
} from "./editor-session-state";
import type { EditorTextRule } from "./editor-text";
import type { WorkAuthorshipKind } from "@moya/contracts";

const kinds: readonly {
  readonly kind: WorkAuthorshipKind;
  readonly label: string;
  readonly description: string;
}[] = [
  { kind: "original", label: "原创", description: "自己创作的作品" },
  {
    kind: "copy_practice",
    label: "临摹或练习",
    description: "临摹、仿写或练习，可注明参考作品",
  },
  {
    kind: "material_sharing",
    label: "素材分享",
    description: "分享拍摄或收集的素材，可注明来源",
  },
];

const referenceInputs: readonly {
  readonly field: ReferenceField;
  readonly label: string;
  readonly rule: EditorTextRule;
  readonly multiline: boolean;
}[] = [
  {
    field: "referenceTitle",
    label: "参考作品",
    rule: referenceTitleRule,
    multiline: false,
  },
  {
    field: "originalAuthor",
    label: "原作者",
    rule: originalAuthorRule,
    multiline: false,
  },
  { field: "sourceNote", label: "来源", rule: sourceNoteRule, multiline: true },
];

/** 作品性质 (C05): only these fields, the references optional. */
export const AuthorshipFields = ({
  state,
  store,
}: {
  readonly state: EditorSessionState;
  readonly store: EditorSessionStore;
}) => {
  const name = useId();
  return (
    <fieldset className={styles.field} data-editor-field="authorship">
      <legend>作品性质</legend>
      <div className={styles.options}>
        {kinds.map((entry) => (
          <label className={styles.option} key={entry.kind}>
            <input
              checked={state.authorshipKind === entry.kind}
              name={name}
              onChange={() => store.setAuthorshipKind(entry.kind)}
              type="radio"
              value={entry.kind}
            />
            <span className={styles.optionText}>
              <span>{entry.label}</span>
              <small>{entry.description}</small>
            </span>
          </label>
        ))}
      </div>
      {state.authorshipKind === "original" ? null : (
        <div className={styles.referenceFields} data-editor-references="">
          {referenceInputs.map((input) => (
            <TextField
              key={input.field}
              error={state.fieldErrors[input.field] ?? null}
              field={input.field}
              label={input.label}
              multiline={input.multiline}
              onChange={(value) => store.setReference(input.field, value)}
              optional
              rule={input.rule}
              size="small"
              value={state.reference[input.field]}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
};
