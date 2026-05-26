import { expect } from 'chai';
import { PermissionRole, ResourceType, Visibility } from '@prisma/client';
import { ResourcePermissionEvaluator } from '../../src/permissions/permissions.utils';
import type { ResourceWithPermissions } from '../../src/resources/resources.types';

function makeResource(
  overrides: Partial<ResourceWithPermissions> & { id: string; ownerId: string },
): ResourceWithPermissions {
  return {
    name: 'test',
    type: ResourceType.FOLDER,
    parentId: null,
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

describe('ResourcePermissionEvaluator', () => {
  const OWNER_ID = 'user-owner';
  const EDITOR_ID = 'user-editor';
  const VIEWER_ID = 'user-viewer';
  const STRANGER_ID = 'user-stranger';

  describe('buildAccessMap — direct access', () => {
    it('grants owner role to the resource owner', () => {
      const resource = makeResource({ id: 'r1', ownerId: OWNER_ID });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [resource],
        OWNER_ID,
      );

      expect(map.get('r1')?.effectiveRole).to.equal('owner');
    });

    it('grants editor role when the user has an EDITOR permission', () => {
      const resource = makeResource({
        id: 'r1',
        ownerId: OWNER_ID,
        permissions: [
          {
            id: 'p1',
            resourceId: 'r1',
            userId: EDITOR_ID,
            role: PermissionRole.EDITOR,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [resource],
        EDITOR_ID,
      );

      expect(map.get('r1')?.effectiveRole).to.equal('editor');
    });

    it('grants viewer role when the user has a VIEWER permission', () => {
      const resource = makeResource({
        id: 'r1',
        ownerId: OWNER_ID,
        permissions: [
          {
            id: 'p1',
            resourceId: 'r1',
            userId: VIEWER_ID,
            role: PermissionRole.VIEWER,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [resource],
        VIEWER_ID,
      );

      expect(map.get('r1')?.effectiveRole).to.equal('viewer');
    });

    it('does not grant access to a PUBLIC resource without ownership or permission', () => {
      const resource = makeResource({
        id: 'r1',
        ownerId: OWNER_ID,
        visibility: Visibility.PUBLIC,
      });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [resource],
        STRANGER_ID,
      );

      expect(map.get('r1')?.effectiveRole).to.equal(null);
    });

    it('returns null effectiveRole for a PRIVATE resource the user cannot access', () => {
      const resource = makeResource({ id: 'r1', ownerId: OWNER_ID });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [resource],
        STRANGER_ID,
      );

      expect(map.get('r1')?.effectiveRole).to.equal(null);
    });
  });

  describe('buildAccessMap — inheritance', () => {
    it('inherits parent role for a child resource with no direct permission', () => {
      const parent = makeResource({
        id: 'parent',
        ownerId: OWNER_ID,
        permissions: [
          {
            id: 'p1',
            resourceId: 'parent',
            userId: VIEWER_ID,
            role: PermissionRole.VIEWER,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const child = makeResource({
        id: 'child',
        ownerId: OWNER_ID,
        parentId: 'parent',
      });

      const map = ResourcePermissionEvaluator.buildAccessMap(
        [parent, child],
        VIEWER_ID,
      );

      expect(map.get('child')?.effectiveRole).to.equal('viewer');
      expect(map.get('child')?.inheritedAccess).to.equal(true);
    });

    it('picks the higher of direct vs inherited role', () => {
      const parent = makeResource({
        id: 'parent',
        ownerId: OWNER_ID,
        permissions: [
          {
            id: 'p1',
            resourceId: 'parent',
            userId: EDITOR_ID,
            role: PermissionRole.EDITOR,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const child = makeResource({
        id: 'child',
        ownerId: OWNER_ID,
        parentId: 'parent',
        permissions: [
          {
            id: 'p2',
            resourceId: 'child',
            userId: EDITOR_ID,
            role: PermissionRole.VIEWER,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [parent, child],
        EDITOR_ID,
      );

      expect(map.get('child')?.effectiveRole).to.equal('editor');
    });

    it('does not inherit access into a private sibling', () => {
      const parent = makeResource({
        id: 'parent',
        ownerId: OWNER_ID,
        permissions: [
          {
            id: 'p1',
            resourceId: 'parent',
            userId: VIEWER_ID,
            role: PermissionRole.VIEWER,
            shareInvitationId: null,
            createdAt: new Date(),
          },
        ],
      });
      const child = makeResource({
        id: 'child',
        ownerId: OWNER_ID,
        parentId: 'parent',
      });
      const sibling = makeResource({
        id: 'sibling',
        ownerId: OWNER_ID,
        parentId: null,
      });
      const map = ResourcePermissionEvaluator.buildAccessMap(
        [parent, child, sibling],
        VIEWER_ID,
      );

      expect(map.get('sibling')?.effectiveRole).to.equal(null);
    });
  });

  describe('canRead', () => {
    it('returns true for owner', () => {
      expect(ResourcePermissionEvaluator.canRead('owner')).to.equal(true);
    });

    it('returns true for editor', () => {
      expect(ResourcePermissionEvaluator.canRead('editor')).to.equal(true);
    });

    it('returns true for viewer', () => {
      expect(ResourcePermissionEvaluator.canRead('viewer')).to.equal(true);
    });

    it('returns false for null', () => {
      expect(ResourcePermissionEvaluator.canRead(null)).to.equal(false);
    });
  });

  describe('canEdit', () => {
    it('returns true for owner', () => {
      expect(ResourcePermissionEvaluator.canEdit('owner')).to.equal(true);
    });

    it('returns true for editor', () => {
      expect(ResourcePermissionEvaluator.canEdit('editor')).to.equal(true);
    });

    it('returns false for viewer', () => {
      expect(ResourcePermissionEvaluator.canEdit('viewer')).to.equal(false);
    });

    it('returns false for null', () => {
      expect(ResourcePermissionEvaluator.canEdit(null)).to.equal(false);
    });
  });
});
