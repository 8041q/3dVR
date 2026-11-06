// Administration grants no access to somebody else's projects.
// An enrolled owner can use normal project permissions with the same login.
export function canAuthorProjects(user) {
  return Boolean(user && !user.banned && !user.mustChangePassword && !user.deletionPending && !user.purging && (user.role==='user' || (user.role==='owner' && user.twoFactorEnabled)))
}
