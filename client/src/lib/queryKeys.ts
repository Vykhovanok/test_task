export const queryKeys = {
  auth: {
    me: ["auth", "me"] as const,
  },
  resources: {
    children: (parentId: string | null) =>
      ["resources", "children", parentId ?? "root"] as const,
    shared: ["resources", "shared"] as const,
    folders: (excludeSubtreeOf: string | null) =>
      ["resources", "folders", excludeSubtreeOf ?? "none"] as const,
    path: (folderId: string) => ["resources", "path", folderId] as const,
    search: (query: string) => ["resources", "search", query] as const,
  },
  shares: {
    invitations: (resourceId: string) =>
      ["shares", "invitations", resourceId] as const,
    publicLink: (resourceId: string) =>
      ["shares", "publicLink", resourceId] as const,
  },
  publicLinks: {
    resolve: (token: string) => ["publicLinks", "resolve", token] as const,
  },
};

export const resourceMutationKey = ["resources"] as const;
