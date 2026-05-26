import { expect } from 'chai';
import { ResourceType, Visibility } from '@prisma/client';
import { ResourceTreeBuilder } from '../../src/resources/resources.utils';
import type {
  ResourceAccessDescriptor,
  ResourceWithPermissions,
} from '../../src/resources/resources.types';

function makeResource(
  id: string,
  parentId: string | null = null,
  overrides: Partial<ResourceWithPermissions> = {},
): ResourceWithPermissions {
  return {
    id,
    name: id,
    type: ResourceType.FOLDER,
    ownerId: 'owner',
    parentId,
    visibility: Visibility.PRIVATE,
    mimeType: null,
    originalFilename: null,
    storagePath: null,
    compressedPath: null,
    size: null,
    sortOrder: 0,
    processingStatus: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [],
    ...overrides,
  };
}

function makeDescriptor(
  resource: ResourceWithPermissions,
  role: 'owner' | 'editor' | 'viewer' | null = 'owner',
): ResourceAccessDescriptor {
  return {
    resource,
    effectiveRole: role,
    inheritedAccess: false,
    permissionRole: null,
  };
}

describe('ResourceTreeBuilder', () => {
  describe('buildChildrenMap', () => {
    it('groups children by parentId', () => {
      const root = makeResource('root');
      const child1 = makeResource('child1', 'root');
      const child2 = makeResource('child2', 'root');
      const grandchild = makeResource('grandchild', 'child1');

      const map = ResourceTreeBuilder.buildChildrenMap([
        root,
        child1,
        child2,
        grandchild,
      ]);

      expect(map.get(null)).to.deep.include(root);
      expect(map.get('root')).to.have.length(2);
      expect(map.get('child1')).to.have.length(1);
    });

    it('returns empty map for empty input', () => {
      const map = ResourceTreeBuilder.buildChildrenMap([]);
      expect(map.size).to.equal(0);
    });

    it('sorts siblings by sortOrder ascending', () => {
      const a = makeResource('a', null, { sortOrder: 2 });
      const b = makeResource('b', null, { sortOrder: 0 });
      const c = makeResource('c', null, { sortOrder: 1 });

      const map = ResourceTreeBuilder.buildChildrenMap([a, b, c]);
      const roots = map.get(null)!;

      expect(roots[0].id).to.equal('b');
      expect(roots[1].id).to.equal('c');
      expect(roots[2].id).to.equal('a');
    });
  });

  describe('getNextSortOrder', () => {
    it('returns 0 when siblings list is empty', () => {
      expect(ResourceTreeBuilder.getNextSortOrder([])).to.equal(0);
    });

    it('returns 0 when siblings is undefined', () => {
      expect(ResourceTreeBuilder.getNextSortOrder(undefined)).to.equal(0);
    });

    it('returns max sortOrder + 1', () => {
      const siblings = [
        makeResource('a', null, { sortOrder: 3 }),
        makeResource('b', null, { sortOrder: 7 }),
        makeResource('c', null, { sortOrder: 1 }),
      ];
      expect(ResourceTreeBuilder.getNextSortOrder(siblings)).to.equal(8);
    });
  });

  describe('build', () => {
    it('returns only accessible (non-null role) resources', () => {
      const accessible = makeResource('accessible');
      const inaccessible = makeResource('inaccessible');

      const accessMap = new Map<string, ResourceAccessDescriptor>([
        ['accessible', makeDescriptor(accessible, 'viewer')],
        ['inaccessible', makeDescriptor(inaccessible, null)],
      ]);

      const tree = ResourceTreeBuilder.build(accessMap);
      const ids = tree.map((n) => n.id);

      expect(ids).to.include('accessible');
      expect(ids).not.to.include('inaccessible');
    });

    it('nests children under their parent node', () => {
      const parent = makeResource('parent');
      const child = makeResource('child', 'parent');

      const accessMap = new Map<string, ResourceAccessDescriptor>([
        ['parent', makeDescriptor(parent, 'owner')],
        ['child', makeDescriptor(child, 'owner')],
      ]);

      const tree = ResourceTreeBuilder.build(accessMap);

      expect(tree).to.have.length(1);
      expect(tree[0].id).to.equal('parent');
      expect(tree[0].children).to.have.length(1);
      expect(tree[0].children[0].id).to.equal('child');
    });

    it('returns multiple root nodes for items with null parentId', () => {
      const r1 = makeResource('r1');
      const r2 = makeResource('r2');

      const accessMap = new Map<string, ResourceAccessDescriptor>([
        ['r1', makeDescriptor(r1, 'owner')],
        ['r2', makeDescriptor(r2, 'owner')],
      ]);

      const tree = ResourceTreeBuilder.build(accessMap);
      expect(tree).to.have.length(2);
    });

    it('orphans a child whose parent is inaccessible — promotes it to root', () => {
      const parent = makeResource('parent');
      const child = makeResource('child', 'parent');

      const accessMap = new Map<string, ResourceAccessDescriptor>([
        ['parent', makeDescriptor(parent, null)],
        ['child', makeDescriptor(child, 'viewer')],
      ]);

      const tree = ResourceTreeBuilder.build(accessMap);

      expect(tree).to.have.length(1);
      expect(tree[0].id).to.equal('child');
      expect(tree[0].parentId).to.equal(null);
    });
  });

  describe('buildCloneDrafts', () => {
    it('names the root clone with " Copy" suffix', () => {
      const source = makeResource('source', null, { name: 'My Folder' });
      const resourcesById = new Map([['source', source]]);
      const childrenByParentId = ResourceTreeBuilder.buildChildrenMap([source]);

      const drafts = ResourceTreeBuilder.buildCloneDrafts(
        source,
        resourcesById,
        childrenByParentId,
        'new-owner',
      );

      expect(drafts[0].name).to.equal('My Folder Copy');
    });

    it('does not add " Copy" suffix to nested children', () => {
      const parent = makeResource('parent', null, { name: 'Parent' });
      const child = makeResource('child', 'parent', { name: 'Child' });
      const resourcesById = new Map([
        ['parent', parent],
        ['child', child],
      ]);
      const childrenByParentId = ResourceTreeBuilder.buildChildrenMap([
        parent,
        child,
      ]);

      const drafts = ResourceTreeBuilder.buildCloneDrafts(
        parent,
        resourcesById,
        childrenByParentId,
        'new-owner',
      );

      const childDraft = drafts.find((d) => d.sourceId === 'child');
      expect(childDraft?.name).to.equal('Child');
    });

    it('assigns the new ownerId to all cloned nodes', () => {
      const source = makeResource('source');
      const resourcesById = new Map([['source', source]]);
      const childrenByParentId = ResourceTreeBuilder.buildChildrenMap([source]);

      const drafts = ResourceTreeBuilder.buildCloneDrafts(
        source,
        resourcesById,
        childrenByParentId,
        'new-owner',
      );

      expect(drafts.every((d) => d.ownerId === 'new-owner')).to.equal(true);
    });

    it('preserves nested sortOrder values for cloned descendants', () => {
      const parent = makeResource('parent', null, { sortOrder: 4 });
      const child = makeResource('child', 'parent', { sortOrder: 7 });
      const resourcesById = new Map([
        ['parent', parent],
        ['child', child],
      ]);
      const childrenByParentId = ResourceTreeBuilder.buildChildrenMap([
        parent,
        child,
      ]);

      const drafts = ResourceTreeBuilder.buildCloneDrafts(
        parent,
        resourcesById,
        childrenByParentId,
        'new-owner',
      );

      const childDraft = drafts.find((draft) => draft.sourceId === 'child');
      expect(childDraft?.sortOrder).to.equal(7);
    });
  });
});
