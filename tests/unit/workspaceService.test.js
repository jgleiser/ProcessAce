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
const { DEFAULT_PERSONAL_WORKSPACE_NAME, WORKSPACE_KINDS } = require('../../src/utils/workspaces');

let adminUser;
let editorUser;
let adminWorkspaceId;

describe('WorkspaceService', () => {
  before(async () => {
    // Create test users via authService (which also creates default workspaces)
    adminUser = await authService.registerUser('WS Admin', 'ws_admin@test.com', 'Password123');
    editorUser = await authService.registerUser('WS Editor', 'ws_editor@test.com', 'Password123');
    db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(editorUser.id);

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
      assert.strictEqual(ws.workspace_kind, WORKSPACE_KINDS.NAMED);

      // Owner should be admin member
      const role = workspaceService.getMemberRole(ws.id, adminUser.id);
      assert.strictEqual(role, 'owner'); // getMemberRole returns 'owner' for owner_id match
    });

    it('should reject reserved personal workspace names', async () => {
      await assert.rejects(async () => {
        await workspaceService.createWorkspace(DEFAULT_PERSONAL_WORKSPACE_NAME, adminUser.id);
      }, /reserved workspace names/);

      await assert.rejects(async () => {
        await workspaceService.createWorkspace('Daniela Personal Workspace', adminUser.id);
      }, /reserved workspace names/);
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
      assert.strictEqual(ws.name, DEFAULT_PERSONAL_WORKSPACE_NAME);
      assert.strictEqual(ws.workspace_kind, WORKSPACE_KINDS.PERSONAL);
      assert.strictEqual(ws.personal_owner_user_id, adminUser.id);
      assert.strictEqual(ws.is_default_workspace, true);
      assert.strictEqual(ws.is_protected_personal_workspace, false);
    });

    it('should repair a stale My Workspace row before decorating it', () => {
      db.prepare('UPDATE workspaces SET workspace_kind = ?, personal_owner_user_id = NULL WHERE id = ?').run(WORKSPACE_KINDS.NAMED, adminWorkspaceId);

      const repairedWorkspace = workspaceService.getUserWorkspaces(adminUser.id).find((workspace) => workspace.id === adminWorkspaceId);

      assert.ok(repairedWorkspace);
      assert.strictEqual(repairedWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
      assert.strictEqual(repairedWorkspace.personal_owner_user_id, adminUser.id);
      assert.strictEqual(repairedWorkspace.is_default_workspace, true);
      assert.strictEqual(repairedWorkspace.is_protected_personal_workspace, false);
    });

    it('should repair duplicate legacy My Workspace rows for the owner and transferred personal workspace', async () => {
      const legacyOwner = await authService.registerUser('Legacy Owner', `legacy_owner_${Date.now()}@test.com`, 'Password123');
      authService.approveUser(legacyOwner.id);
      const legacyInactiveUser = await authService.registerUser('Legacy Daniela', `legacy_daniela_${Date.now()}@test.com`, 'Password123');
      authService.approveUser(legacyInactiveUser.id);
      authService.updateUser(legacyInactiveUser.id, { status: 'inactive' });

      const ownerDefaultWorkspace = db
        .prepare('SELECT id FROM workspaces WHERE owner_id = ? AND name = ? ORDER BY created_at ASC LIMIT 1')
        .get(legacyOwner.id, DEFAULT_PERSONAL_WORKSPACE_NAME);
      const transferredWorkspaceId = `legacy-transferred-${Date.now()}`;
      const timestamp = new Date().toISOString();

      db.prepare('UPDATE workspaces SET workspace_kind = ?, personal_owner_user_id = NULL WHERE id = ?').run(
        WORKSPACE_KINDS.NAMED,
        ownerDefaultWorkspace.id,
      );
      db.prepare(
        `
          INSERT INTO workspaces (id, name, owner_id, created_at, workspace_kind, personal_owner_user_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
      ).run(transferredWorkspaceId, DEFAULT_PERSONAL_WORKSPACE_NAME, legacyOwner.id, timestamp, WORKSPACE_KINDS.NAMED, null);
      workspaceService.addMember(transferredWorkspaceId, legacyOwner.id, 'admin');
      workspaceService.addMember(transferredWorkspaceId, legacyInactiveUser.id, 'admin');

      const repairedWorkspaces = workspaceService.getUserWorkspaces(legacyOwner.id);
      const repairedDefaultWorkspace = repairedWorkspaces.find((workspace) => workspace.id === ownerDefaultWorkspace.id);
      const repairedTransferredWorkspace = repairedWorkspaces.find((workspace) => workspace.id === transferredWorkspaceId);

      assert.ok(repairedDefaultWorkspace);
      assert.strictEqual(repairedDefaultWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
      assert.strictEqual(repairedDefaultWorkspace.personal_owner_user_id, legacyOwner.id);
      assert.strictEqual(repairedDefaultWorkspace.is_default_workspace, true);

      assert.ok(repairedTransferredWorkspace);
      assert.strictEqual(repairedTransferredWorkspace.name, 'Legacy Daniela Personal Workspace');
      assert.strictEqual(repairedTransferredWorkspace.workspace_kind, WORKSPACE_KINDS.PERSONAL);
      assert.strictEqual(repairedTransferredWorkspace.personal_owner_user_id, legacyInactiveUser.id);
      assert.strictEqual(repairedTransferredWorkspace.is_default_workspace, false);
      assert.strictEqual(repairedTransferredWorkspace.is_protected_personal_workspace, true);
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
      const result = workspaceService.inviteUser(adminWorkspaceId, adminUser.id, editorUser.email, 'editor');
      assert.ok(result.token);
      assert.strictEqual(result.email, editorUser.email);
      assert.strictEqual(result.status, 'created');
    });

    it('should resolve recipient email case-insensitively', () => {
      const result = workspaceService.inviteUser(adminWorkspaceId, adminUser.id, editorUser.email.toUpperCase(), 'viewer');
      assert.strictEqual(result.email, editorUser.email);
    });

    it('should throw when inviting non-registered user', () => {
      assert.throws(() => {
        workspaceService.inviteUser(adminWorkspaceId, adminUser.id, 'nonexistent@test.com', 'viewer');
      }, /User must be registered/);
    });

    it('should update existing invitation on re-invite', () => {
      const result = workspaceService.inviteUser(adminWorkspaceId, adminUser.id, editorUser.email, 'viewer');
      assert.strictEqual(result.status, 'updated');
    });
  });

  // --- getInvitation / acceptInvitation ---
  describe('acceptInvitation', () => {
    let wsId;
    let inviteToken;
    let outsiderUser;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Invite Accept WS', adminUser.id);
      wsId = ws.id;
      const result = workspaceService.inviteUser(wsId, adminUser.id, editorUser.email, 'editor');
      inviteToken = result.token;
      outsiderUser = await authService.registerUser('WS Outsider', `ws_outsider_${Date.now()}@test.com`, 'Password123');
      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(outsiderUser.id);
    });

    it('should reject accepting when authenticated user is not the invitation recipient', () => {
      assert.throws(() => {
        workspaceService.acceptInvitation(inviteToken, outsiderUser.id);
      }, /Invitation does not belong to authenticated user/);

      const inviteRow = db.prepare('SELECT status FROM workspace_invitations WHERE token = ?').get(inviteToken);
      assert.strictEqual(inviteRow.status, 'pending');
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
    let outsiderUser;

    before(async () => {
      const ws = await workspaceService.createWorkspace('Invite Decline WS', adminUser.id);
      const result = workspaceService.inviteUser(ws.id, adminUser.id, editorUser.email, 'viewer');
      inviteToken = result.token;
      outsiderUser = await authService.registerUser('WS Decline Outsider', `ws_decline_outsider_${Date.now()}@test.com`, 'Password123');
      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(outsiderUser.id);
    });

    it('should reject declining when authenticated user is not the invitation recipient', () => {
      assert.throws(() => {
        workspaceService.declineInvitation(inviteToken, outsiderUser.id);
      }, /Invitation does not belong to authenticated user/);

      const inviteRow = db.prepare('SELECT status FROM workspace_invitations WHERE token = ?').get(inviteToken);
      assert.strictEqual(inviteRow.status, 'pending');
    });

    it('should decline a valid invitation', () => {
      const result = workspaceService.declineInvitation(inviteToken, editorUser.id);
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
      const members = db.prepare('SELECT * FROM workspace_members WHERE workspace_id = ?').all(wsId);
      assert.strictEqual(members.length, 0);
    });

    it('should reject deleting a stale personal workspace row that lost its metadata', () => {
      db.prepare('UPDATE workspaces SET workspace_kind = ?, personal_owner_user_id = NULL WHERE id = ?').run(WORKSPACE_KINDS.NAMED, adminWorkspaceId);

      assert.throws(() => {
        workspaceService.deleteWorkspace(adminWorkspaceId);
      }, /Personal workspaces cannot be deleted/);
    });
  });

  describe('transferOwnership', () => {
    let namedWorkspaceId;

    before(async () => {
      const namedWorkspace = await workspaceService.createWorkspace('Transfer Ownership WS', adminUser.id);
      namedWorkspaceId = namedWorkspace.id;
      workspaceService.addMember(namedWorkspaceId, editorUser.id, 'editor');
    });

    it('should transfer ownership of a named workspace to an active member', () => {
      const updatedWorkspace = workspaceService.transferOwnership(namedWorkspaceId, editorUser.id);

      assert.strictEqual(updatedWorkspace.owner_id, editorUser.id);
      assert.strictEqual(workspaceService.getMemberRole(namedWorkspaceId, adminUser.id), 'admin');
      assert.strictEqual(workspaceService.getMemberRole(namedWorkspaceId, editorUser.id), 'owner');
    });

    it('should reject transferring a personal workspace', () => {
      assert.throws(() => {
        workspaceService.transferOwnership(adminWorkspaceId, editorUser.id);
      }, /Personal workspaces cannot be transferred/);
    });

    it('should reject transferring ownership to a non-member or inactive member', async () => {
      const anotherWorkspace = await workspaceService.createWorkspace('Inactive Transfer WS', adminUser.id);
      const inactiveUser = await authService.registerUser('Inactive Transfer', 'inactive_transfer@test.com', 'Password123');
      workspaceService.addMember(anotherWorkspace.id, inactiveUser.id, 'viewer');
      db.prepare("UPDATE users SET status = 'inactive' WHERE id = ?").run(inactiveUser.id);

      assert.throws(() => {
        workspaceService.transferOwnership(anotherWorkspace.id, 'missing-user-id');
      }, /New owner must be an active workspace member/);

      assert.throws(() => {
        workspaceService.transferOwnership(anotherWorkspace.id, inactiveUser.id);
      }, /New owner must be an active workspace member/);
    });
  });
});
