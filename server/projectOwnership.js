import { accountUnavailable, accountControls } from './accountState.js'

// grants.owner is a storage custodian for the existing schema, not a superior
// project role. Every account in this set has the same project permissions.
export function projectOwnerIds(db, project) {
  return db.prepare('SELECT owner AS user FROM grants WHERE project=? UNION SELECT user FROM members WHERE project=? ORDER BY user').all(project,project).map(row=>row.user)
}

export function accountProjects(db, userId) {
  return db.prepare('SELECT g.* FROM grants g WHERE g.owner=? OR EXISTS(SELECT 1 FROM members m WHERE m.project=g.project AND m.user=?) ORDER BY g.project').all(userId,userId)
}

export function projectUnavailable(db, project) {
  const owners=projectOwnerIds(db,project)
  return !owners.length || owners.every(userId=>accountUnavailable(db,userId))
}

export function survivingProjectOwners(db, project, departing, now=Date.now()) {
  return projectOwnerIds(db,project).filter(userId=> {
    if(userId===departing || !db.prepare('SELECT 1 FROM user WHERE id=?').get(userId)) return false
    const state=accountControls(db,userId)
    return !state.purging && !(state.deleteAfter && state.deleteAfter<=now)
  })
}

export function setProjectOwners(db, project, owners) {
  const current=db.prepare('SELECT owner FROM grants WHERE project=?').get(project)
  if(!current || !owners.length) throw new Error('A project must have at least one owner.')
  const custodian=owners.includes(current.owner) ? current.owner : owners.slice().sort()[0]
  db.prepare('UPDATE grants SET owner=? WHERE project=?').run(custodian,project)
  db.prepare('DELETE FROM members WHERE project=?').run(project)
  // Keep the legacy column compatible with existing databases. Its old
  // view/edit distinction is no longer used for authorisation.
  for(const userId of owners) if(userId!==custodian) db.prepare("INSERT INTO members(project,user,permission) VALUES(?,?,'edit')").run(project,userId)
  db.prepare("UPDATE resources SET owner=? WHERE kind='snapshot' AND id LIKE ?").run(custodian,project+'/%')
}
