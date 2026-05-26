import { expect } from "chai";
import { ResourceTree } from "@/lib/tree";
import { makeResourceNode } from "./support/resource-node";

describe("ResourceTree sync helpers", () => {
  it("detects when the active folder no longer exists in a refreshed tree", () => {
    const hiddenFolder = makeResourceNode({ id: "folder-1", name: "Reports" });
    const nextTree = [makeResourceNode({ id: "folder-2", name: "Repository" })];

    expect(ResourceTree.containsNode([hiddenFolder], "folder-1")).to.equal(true);
    expect(ResourceTree.containsNode(nextTree, "folder-1")).to.equal(false);
  });

  it("rejects invalid move destinations inside a subtree", () => {
    const parent = makeResourceNode({
      id: "parent",
      name: "Parent",
      children: [
        makeResourceNode({ id: "child", name: "Child", parentId: "parent" }),
      ],
    });

    expect(
      ResourceTree.isValidMoveDestination([parent], "parent", "child"),
    ).to.equal(false);
    expect(
      ResourceTree.isValidMoveDestination([parent], "parent", "parent"),
    ).to.equal(false);
    expect(
      ResourceTree.isValidMoveDestination([parent], "child", "parent"),
    ).to.equal(true);
  });
});
