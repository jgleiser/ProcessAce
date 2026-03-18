const USER_ROLES = ['superadmin', 'admin', 'editor', 'viewer'];
const SELF_SERVICE_ROLE_OPTIONS = ['editor', 'viewer'];
const ADMIN_ROLES = new Set(['superadmin', 'admin']);

const isAdminRole = (role) => ADMIN_ROLES.has(role);
const isSuperAdminRole = (role) => role === 'superadmin';

module.exports = {
  USER_ROLES,
  SELF_SERVICE_ROLE_OPTIONS,
  isAdminRole,
  isSuperAdminRole,
};
