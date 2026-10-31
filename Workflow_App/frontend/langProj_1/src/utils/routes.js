// src/utils/routes.js

export const flowPath = (routeSlug, groupId) =>
  groupId ? `/group/${groupId}/flow/${routeSlug}` : `/flow/${routeSlug}`;

export const groupPath = (groupId) => `/group/${groupId}`;