import type { Access, CollectionConfig, FieldAccess } from "payload";
const owner: Access = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "owner";
const ownerField: FieldAccess = ({ req }) =>
  req.user?.collection === "users" && req.user.role === "owner";
export const Users: CollectionConfig = {
  slug: "users",
  labels: { singular: "操作身份", plural: "操作身份" },
  admin: { useAsTitle: "email", group: "系统与自动化" },
  auth: {
    useAPIKey: true,
    tokenExpiration: 7200,
    maxLoginAttempts: 5,
    lockTime: 600000,
    cookies: {
      secure: process.env.CMS_ENVIRONMENT !== "synthetic",
      sameSite: "Strict",
    },
  },
  access: {
    admin: ({ req }) => owner({ req }) === true,
    create: owner,
    read: owner,
    update: owner,
    delete: () => false,
    unlock: owner,
  },
  fields: [
    {
      name: "role",
      type: "select",
      label: "角色",
      required: true,
      defaultValue: "automation",
      options: [
        { label: "Owner", value: "owner" },
        { label: "内容自动化", value: "automation" },
      ],
      access: { create: ownerField, update: ownerField },
    },
    {
      name: "scopeCatalogIds",
      type: "json",
      label: "获准内容范围",
      defaultValue: [],
      access: { create: ownerField, update: ownerField },
      validate: (value: unknown) =>
        (Array.isArray(value) &&
          value.length <= 10000 &&
          value.every(
            (id: unknown) =>
              typeof id === "string" &&
              /^[^\s]{1,128}$/.test(id) &&
              !id.includes(String.fromCharCode(0)),
          )) ||
        "需要明确的 CatalogId 范围",
    },
  ],
};
