import type { FlattenedResourceMap, ResourceNode } from "./models";

export class ResourceTree {
  static flatten(nodes: ResourceNode[]): FlattenedResourceMap {
    const entities: FlattenedResourceMap = {};

    const visit = (node: ResourceNode): void => {
      entities[node.id] = node;

      for (const child of node.children) {
        visit(child);
      }
    };

    for (const node of nodes) {
      visit(node);
    }

    return entities;
  }

  static findNode(
    nodes: ResourceNode[],
    targetId: string | null,
  ): ResourceNode | null {
    if (targetId === null) {
      return null;
    }

    for (const node of nodes) {
      if (node.id === targetId) {
        return node;
      }

      const nested = this.findNode(node.children, targetId);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  static getChildrenForFolder(
    nodes: ResourceNode[],
    folderId: string | null,
  ): ResourceNode[] {
    if (folderId === null) {
      return nodes;
    }

    return this.findNode(nodes, folderId)?.children ?? [];
  }

  static containsNode(nodes: ResourceNode[], targetId: string | null): boolean {
    if (targetId === null) {
      return true;
    }

    return this.findNode(nodes, targetId) !== null;
  }

  static getDisplayNameForFolder(
    nodes: ResourceNode[],
    folderId: string | null,
  ): string {
    if (folderId === null) {
      return "Root";
    }

    return this.findNode(nodes, folderId)?.name ?? "Root";
  }

  static isDescendantOf(
    nodes: ResourceNode[],
    ancestorId: string,
    candidateId: string,
  ): boolean {
    const ancestor = this.findNode(nodes, ancestorId);

    if (!ancestor) {
      return false;
    }

    const visit = (node: ResourceNode): boolean => {
      if (node.id === candidateId) {
        return true;
      }

      for (const child of node.children) {
        if (visit(child)) {
          return true;
        }
      }

      return false;
    };

    return visit(ancestor);
  }

  static isValidMoveDestination(
    nodes: ResourceNode[],
    resourceId: string,
    destinationParentId: string | null,
  ): boolean {
    if (destinationParentId === null) {
      return true;
    }

    if (resourceId === destinationParentId) {
      return false;
    }

    return !this.isDescendantOf(nodes, resourceId, destinationParentId);
  }

  static listFolders(
    nodes: ResourceNode[],
  ): Array<{ id: string; name: string; depth: number }> {
    const folders: Array<{ id: string; name: string; depth: number }> = [];

    const visit = (children: ResourceNode[], depth: number): void => {
      for (const node of children) {
        if (node.type !== "FOLDER") {
          continue;
        }

        folders.push({ id: node.id, name: node.name, depth });

        if (node.children.length > 0) {
          visit(node.children, depth + 1);
        }
      }
    };

    visit(nodes, 0);

    return folders;
  }
}
