export const DELETION_DELAY = 30 * 86400000

export function accountControls(db, userId) {
  return db.prepare('SELECT * FROM account_controls WHERE userId=?').get(userId) || {}
}

export function accountUnavailable(db, userId) {
  const state = accountControls(db, userId)
  return Boolean(state.deleteAfter || state.purging)
}

export function decorateAccount(db, user) {
  const state = accountControls(db, user.id)
  return { ...user, mustChangePassword: Boolean(state.mustChangePassword), deletionPending: Boolean(state.deleteAfter), deletionRequestedAt: state.deletionRequestedAt || null, deleteAfter: state.deleteAfter || null, purging: Boolean(state.purging) }
}

export function cancelScheduledDeletion(db, identity, now = Date.now()) {
  if(!identity?.session || !identity.user) return false
  const createdAt=new Date(identity.session.createdAt).getTime()
  return db.prepare('UPDATE account_controls SET deletionRequestedAt=NULL,deleteAfter=NULL,deletionCanceledAt=? WHERE userId=? AND deleteAfter>? AND deletionRequestedAt<=? AND purging=0 AND EXISTS(SELECT 1 FROM session WHERE id=? AND userId=?)').run(now,identity.user.id,now,createdAt,identity.session.id,identity.user.id).changes > 0
}
