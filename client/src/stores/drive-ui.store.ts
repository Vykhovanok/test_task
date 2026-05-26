import { create } from "zustand";

type DriveUiState = {
  activeFolderId: string | null;
  searchQuery: string;
  managedResourceId: string | null;
  expandedFolderIds: Record<string, true>;
  setActiveFolderId: (folderId: string | null) => void;
  setSearchQuery: (query: string) => void;
  setManagedResourceId: (resourceId: string | null) => void;
  toggleFolderExpanded: (folderId: string) => void;
  selectFolder: (folderId: string | null) => void;
};

export const useDriveUiStore = create<DriveUiState>((set) => ({
  activeFolderId: null,
  searchQuery: "",
  managedResourceId: null,
  expandedFolderIds: {},
  setActiveFolderId: (folderId) => set({ activeFolderId: folderId }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setManagedResourceId: (resourceId) => set({ managedResourceId: resourceId }),
  toggleFolderExpanded: (folderId) =>
    set((state) => {
      const next = { ...state.expandedFolderIds };

      if (next[folderId]) {
        delete next[folderId];
      } else {
        next[folderId] = true;
      }

      return { expandedFolderIds: next };
    }),
  selectFolder: (folderId) =>
    set((state) => ({
      activeFolderId: folderId,
      searchQuery: "",
      expandedFolderIds:
        folderId === null
          ? state.expandedFolderIds
          : {
              ...state.expandedFolderIds,
              [folderId]: true,
            },
    })),
}));
