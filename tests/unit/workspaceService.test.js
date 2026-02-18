const { describe, it, before } = require('node:test');
const assert = require('node:assert');

// Set up test environment BEFORE requiring modules
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';

// Import modules after env setup
const authService = require('../../src/services/authService');
const workspaceService = require('../../src/services/workspaceService');
const db = require('../../src/services/db');

let adminUser;
let editorUser;
let adminWorkspaceId;

describe('WorkspaceService', () => {
  before(async () => {
    // Create test users via authService (which also creates default workspaces)
    adminUser = await authService.registerUser('WS Admin', 'ws_admin@test.com', 'Password123');
    editorUser = await authService.registerUser('WS Editor', 'ws_editor@test.com', 'Password123');

    // Find admin's default workspace
    const workspaces = workspaceService.getUserWorkspaces(adminUser.id);
    adminWorkspaceId = workspaces[0].id;
  });

  // --- createWorkspace ---
  describe('createWorkspace', () => {
    it('should create a workspace and set owner as admin member', async () => {
      const ws = await workspaceService.createWorkspace('Test WS', adminUser.id);
      assert.ok(ws.id);
      assert.strictEqual(ws.name, 'Test WS');

      // Owner should be admin member
      const role = workspaceService.getMemberRole(ws.id, adminUser.id);
      assert.strictEqual(role, 'owner'); // getMemberRole returns 'owner' for owner_id match
    });
  });

  // --- isMember ---
  describe('isMember', () => {
    it('should return true for a workspace member', () => {
      assert.strictEqual(workspaceService.isMember(adminWorkspaceId, adminUser.id), true);
    });

    it('should return false for a non-member', () => {
      assert.strictEqual(workspaceService.isMember(adminWorkspaceId, editorUser.id), false);
    });
  });

  // --- addMember / getMemberRole ---
  describe('addMember + getMemberRole', () => {
    let wsId;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Member Test WS', adminUser.id);
      wsId = ws.id;
    });

    it('should add a member with default viewer role', () => {
      workspaceService.addMember(wsId, editorUser.id);
      assert.strictEqual(workspaceService.isMember(wsId, editorUser.id), true);
      // Default role is viewer
      const role = workspaceService.getMemberRole(wsId, editorUser.id);
      assert.strictEqual(role, 'viewer');
    });

    it('should return null role for non-member', () => {
      const fakeId = 'non-existent-user-id';
      const role = workspaceService.getMemberRole(wsId, fakeId);
      assert.strictEqual(role, null);
    });
  });

  // --- getUserWorkspaces ---
  describe('getUserWorkspaces', () => {
    it('should return workspaces for a user', () => {
      const workspaces = workspaceService.getUserWorkspaces(adminUser.id);
      assert.ok(Array.isArray(workspaces));
      assert.ok(workspaces.length >= 1);
      // Each workspace should have expected fields
      const ws = workspaces[0];
      assert.ok(ws.id);
      assert.ok(ws.name);
      assert.ok(ws.role);
    });
  });

  // --- getWorkspace ---
  describe('getWorkspace', () => {
    it('should return workspace by id', () => {
      const ws = workspaceService.getWorkspace(adminWorkspaceId);
      assert.ok(ws);
      assert.strictEqual(ws.id, adminWorkspaceId);
    });

    it('should return undefined for non-existent workspace', () => {
      const ws = workspaceService.getWorkspace('non-existent-id');
      assert.strictEqual(ws, undefined);
    });
  });

  // --- getWorkspaceMembers ---
  describe('getWorkspaceMembers', () => {
    it('should return members with user info', () => {
      const members = workspaceService.getWorkspaceMembers(adminWorkspaceId);
      assert.ok(Array.isArray(members));
      assert.ok(members.length >= 1);
      // Owner should have 'owner' role
      const owner = members.find((m) => m.id === adminUser.id);
      assert.ok(owner);
      assert.strictEqual(owner.role, 'owner');
    });
  });

  // --- updateMemberRole ---
  describe('updateMemberRole', () => {
    let wsId;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Role Update WS', adminUser.id);
      wsId = ws.id;
      workspaceService.addMember(wsId, editorUser.id, 'viewer');
    });

    it('should update member role to editor', () => {
      workspaceService.updateMemberRole(wsId, editorUser.id, 'editor');
      const role = workspaceService.getMemberRole(wsId, editorUser.id);
      assert.strictEqual(role, 'editor');
    });

    it('should reject invalid role', () => {
      assert.throws(() => {
        workspaceService.updateMemberRole(wsId, editorUser.id, 'superadmin');
      }, /Invalid role/);
    });

    it('should reject changing owner role', () => {
      assert.throws(() => {
        workspaceService.updateMemberRole(wsId, adminUser.id, 'viewer');
      }, /Cannot change role of workspace owner/);
    });
  });

  // --- removeMember ---
  describe('removeMember', () => {
    let wsId;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Remove Test WS', adminUser.id);
      wsId = ws.id;
      workspaceService.addMember(wsId, editorUser.id, 'editor');
    });

    it('should remove a member', () => {
      assert.strictEqual(workspaceService.isMember(wsId, editorUser.id), true);
      workspaceService.removeMember(wsId, editorUser.id);
      assert.strictEqual(workspaceService.isMember(wsId, editorUser.id), false);
    });
  });

  // --- inviteUser ---
  describe('inviteUser', () => {
    it('should create an invitation for a registered user', () => {
      const result = workspaceService.inviteUser(
        adminWorkspaceId,
        adminUser.id,
        editorUser.email,
        'editor',
      );
      assert.ok(result.token);
      assert.strictEqual(result.email, editorUser.email);
      assert.strictEqual(result.status, 'created');
    });

    it('should throw when inviting non-registered user', () => {
      assert.throws(() => {
        workspaceService.inviteUser(
          adminWorkspaceId,
          adminUser.id,
          'nonexistent@test.com',
          'viewer',
        );
      }, /User must be registered/);
    });

    it('should update existing invitation on re-invite', () => {
      const result = workspaceService.inviteUser(
        adminWorkspaceId,
        adminUser.id,
        editorUser.email,
        'viewer',
      );
      assert.strictEqual(result.status, 'updated');
    });
  });

  // --- getInvitation / acceptInvitation ---
  describe('acceptInvitation', () => {
    let wsId;
    let inviteToken;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Invite Accept WS', adminUser.id);
      wsId = ws.id;
      const result = workspaceService.inviteUser(wsId, adminUser.id, editorUser.email, 'editor');
      inviteToken = result.token;
    });

    it('should accept a valid invitation', () => {
      const result = workspaceService.acceptInvitation(inviteToken, editorUser.id);
      assert.ok(result.workspaceId);
      assert.strictEqual(result.workspaceId, wsId);
      // User should now be a member
      assert.strictEqual(workspaceService.isMember(wsId, editorUser.id), true);
    });

    it('should throw for invalid token', () => {
      assert.throws(() => {
        workspaceService.acceptInvitation('invalid-token', editorUser.id);
      }, /Invalid invitation/);
    });
  });

  // --- declineInvitation ---
  describe('declineInvitation', () => {
    let inviteToken;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Invite Decline WS', adminUser.id);
      const result = workspaceService.inviteUser(ws.id, adminUser.id, editorUser.email, 'viewer');
      inviteToken = result.token;
    });

    it('should decline a valid invitation', () => {
      const result = workspaceService.declineInvitation(inviteToken);
      assert.strictEqual(result.status, 'declined');
    });
  });

  // --- deleteWorkspace ---
  describe('deleteWorkspace', () => {
    let wsId;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Delete WS', adminUser.id);
      wsId = ws.id;
      workspaceService.addMember(wsId, editorUser.id, 'viewer');
    });

    it('should delete workspace and all related data', () => {
      workspaceService.deleteWorkspace(wsId);
      const ws = workspaceService.getWorkspace(wsId);
      assert.strictEqual(ws, undefined);

      // Members should also be deleted
      const members = db
        .prepare('SELECT * FROM workspace_members WHERE workspace_id = ?')
        .all(wsId);
      assert.strictEqual(members.length, 0);
    });
  });
});
