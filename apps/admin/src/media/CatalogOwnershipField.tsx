"use client";

import { useState } from "react";
import {
  Button,
  FieldLabel,
  useDocumentInfo,
  useField,
  useListDrawer,
} from "@payloadcms/ui";
import type { TextFieldClientComponent } from "payload";

/** Choose a native Catalog document while persisting its existing business ID. */
export const CatalogOwnershipField: TextFieldClientComponent = ({
  path,
  field,
}) => {
  const { id } = useDocumentInfo();
  const { value, setValue, disabled } = useField<string>({ path });
  const [label, setLabel] = useState("");
  const [ListDrawer, , { openDrawer, closeDrawer }] = useListDrawer({
    collectionSlugs: ["catalogs"],
    selectedCollection: "catalogs",
  });
  return (
    <div className="field-type text">
      <FieldLabel label={field.label ?? "所属目录"} path={path} required />
      <p>{label || (value ? "已绑定所属目录" : "请选择已有目录")}</p>
      <Button
        type="button"
        buttonStyle="secondary"
        disabled={disabled || Boolean(id)}
        onClick={openDrawer}
      >
        选择所属目录
      </Button>
      {id && <p>图片创建后，所属目录保持不变。</p>}
      <ListDrawer
        allowCreate={false}
        enableRowSelections={false}
        onSelect={({ doc }) => {
          if (typeof doc.catalogId !== "string" || !doc.catalogId.length)
            return;
          setValue(doc.catalogId);
          setLabel(typeof doc.title === "string" ? doc.title : "已选择目录");
          closeDrawer();
        }}
      />
    </div>
  );
};
