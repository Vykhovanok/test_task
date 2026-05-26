import { expect } from "chai";
import { useDriveUiStore } from "@/stores/drive-ui.store";

describe("useDriveUiStore", () => {
  beforeEach(() => {
    useDriveUiStore.setState({
      activeFolderId: null,
      searchQuery: "",
      managedResourceId: null,
    });
  });

  it("clears search when selecting a folder", () => {
    useDriveUiStore.setState({ searchQuery: "photo" });
    useDriveUiStore.getState().selectFolder("folder-9");

    const state = useDriveUiStore.getState();

    expect(state.activeFolderId).to.equal("folder-9");
    expect(state.searchQuery).to.equal("");
  });

  it("tracks managed resource for the sharing panel", () => {
    useDriveUiStore.getState().setManagedResourceId("resource-1");

    expect(useDriveUiStore.getState().managedResourceId).to.equal("resource-1");
  });
});
