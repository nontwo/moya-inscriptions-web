"use client";

import { SelectField, TextareaField, useDocumentInfo } from "@payloadcms/ui";
import type {
  SelectFieldClientComponent,
  TextareaFieldClientComponent,
} from "payload";

export const OriginalRightsField: TextareaFieldClientComponent = (props) => {
  const { id } = useDocumentInfo();
  return <TextareaField {...props} readOnly={Boolean(id || props.readOnly)} />;
};
export const OriginalOrderConfidenceField: SelectFieldClientComponent = (
  props,
) => {
  const { id } = useDocumentInfo();
  return <SelectField {...props} readOnly={Boolean(id || props.readOnly)} />;
};
