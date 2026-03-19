const WORKSPACE_KINDS = Object.freeze({
  NAMED: 'named',
  PERSONAL: 'personal',
});

const DEFAULT_PERSONAL_WORKSPACE_NAME = 'My Workspace';
const PERSONAL_WORKSPACE_SUFFIX = 'Personal Workspace';

const normalizeWorkspaceLabel = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const getPersonalWorkspaceOwnerLabel = (user) => normalizeWorkspaceLabel(user?.name) || normalizeWorkspaceLabel(user?.email) || 'User';

const buildTransferredPersonalWorkspaceName = (user) => `${getPersonalWorkspaceOwnerLabel(user)} ${PERSONAL_WORKSPACE_SUFFIX}`;

const isTransferredPersonalWorkspaceName = (value) => normalizeWorkspaceLabel(value).endsWith(` ${PERSONAL_WORKSPACE_SUFFIX}`);

const isReservedWorkspaceName = (value) => {
  const normalizedValue = normalizeWorkspaceLabel(value);
  return normalizedValue === DEFAULT_PERSONAL_WORKSPACE_NAME || isTransferredPersonalWorkspaceName(normalizedValue);
};

const isPersonalWorkspace = (workspace) => workspace?.workspace_kind === WORKSPACE_KINDS.PERSONAL;

const isNamedWorkspace = (workspace) => workspace?.workspace_kind === WORKSPACE_KINDS.NAMED;

const isProtectedPersonalWorkspace = (workspace) =>
  isPersonalWorkspace(workspace) && Boolean(workspace.personal_owner_user_id) && workspace.owner_id !== workspace.personal_owner_user_id;

const isDefaultWorkspaceForUser = (workspace, userId) =>
  isPersonalWorkspace(workspace) && workspace.owner_id === userId && workspace.personal_owner_user_id === userId;

module.exports = {
  WORKSPACE_KINDS,
  DEFAULT_PERSONAL_WORKSPACE_NAME,
  PERSONAL_WORKSPACE_SUFFIX,
  buildTransferredPersonalWorkspaceName,
  getPersonalWorkspaceOwnerLabel,
  isDefaultWorkspaceForUser,
  isNamedWorkspace,
  isPersonalWorkspace,
  isProtectedPersonalWorkspace,
  isReservedWorkspaceName,
  isTransferredPersonalWorkspaceName,
};
