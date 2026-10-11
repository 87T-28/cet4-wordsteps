const cloud = require('@cloudbase/node-sdk')
const { createHash } = require('node:crypto')
const { createSyncService } = require('./service.cjs')
const { createDeletionProvider } = require('./deletion-auth.cjs')
const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV })
const db = app.database()
const EVENTS = 'wordsteps_events'
const META = 'wordsteps_sync_meta'
const hash = value => createHash('sha256').update(value).digest('hex')
const userKey = uid => hash(uid)
const eventKey = (uid, id) => hash(uid + ':' + id)
const first = response => Array.isArray(response.data) ? response.data[0] : response.data
async function getDocument(doc) {
  try { return first(await doc.get()) } catch (error) {
    if (['DATABASE_DOCUMENT_NOT_EXIST', 'DOCUMENT_NOT_FOUND'].includes(error.code)) return undefined
    throw error
  }
}
const store = {
  async transaction(uid, callback) {
    return db.runTransaction(async transaction => callback({
      getMeta: () => getDocument(transaction.collection(META).doc(userKey(uid))),
      setMeta: meta => transaction.collection(META).doc(userKey(uid)).set(meta),
      getEvent: id => getDocument(transaction.collection(EVENTS).doc(eventKey(uid, id))),
      setEvent: (id, event) => transaction.collection(EVENTS).doc(eventKey(uid, id)).set({ ownerId: uid, ...event }),
    }))
  },
  getMeta: uid => getDocument(db.collection(META).doc(userKey(uid))),
  async pull(uid, cursor, limit) {
    const response = await db.collection(EVENTS).where({ ownerId: uid, sequence: db.command.gt(cursor) }).orderBy('sequence', 'asc').limit(limit).get()
    return response.data
  },
  async erase(uid, limit) {
    const response = await db.collection(EVENTS).where({ ownerId: uid }).limit(limit).get()
    for (const row of response.data) await db.collection(EVENTS).doc(row._id).remove()
    return response.data.length
  },
}
const validIds = new Set(require('./word-ids.json'))
exports.main = async (event, context) => {
  // CloudBase supplies this identity. Never use event.userId as an authority.
  const principal = app.auth().getUserInfo()
  // Resolve platform namespace at invocation time, not during module startup.
  const runtime = cloud.getCloudbaseContext(context)
  const envId = process.env.WORDSTEPS_ENV_ID || runtime.SCF_NAMESPACE || process.env.SCF_NAMESPACE || process.env.TCB_ENV
  const handle = createSyncService(store, validIds, Date.now, createDeletionProvider(envId))
  return handle(event, { uid: principal.uid, isAnonymous: principal.isAnonymous })
}
