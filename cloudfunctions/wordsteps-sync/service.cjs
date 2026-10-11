const fields = ['id', 'wordId', 'deviceId', 'occurredAt', 'kind', 'rating', 'objectiveCorrect', 'schemaVersion']
function fail(code) { const error = new Error(code); error.safeCode = code; throw error }
function normalize(event, validIds, now) {
  if (!event || typeof event !== 'object' || Array.isArray(event)
    || typeof event.id !== 'string' || !/^[\w:-]{1,100}$/.test(event.id)
    || typeof event.deviceId !== 'string' || !/^[\w:-]{1,100}$/.test(event.deviceId)
    || !validIds.has(event.wordId) || event.schemaVersion !== 1
    || !['new', 'review'].includes(event.kind) || !['again', 'hard', 'good', 'easy'].includes(event.rating)
    || ![true, false, null].includes(event.objectiveCorrect) || typeof event.occurredAt !== 'string'
    || !Number.isFinite(Date.parse(event.occurredAt)) || Date.parse(event.occurredAt) < 0 || Date.parse(event.occurredAt) > now + 300000) fail('INVALID_EVENT')
  const result = Object.fromEntries(fields.map(field => [field, event[field]]))
  result.occurredAt = new Date(result.occurredAt).toISOString()
  return result
}
function sameEvent(left, right) { return fields.every(field => left[field] === right[field]) }

exports.createSyncService = function createSyncService(store, validIds, clock = Date.now) {
  return async function handle(payload, principal) {
    try {
      if (!principal || typeof principal.uid !== 'string' || !/^[\w:-]{1,160}$/.test(principal.uid) || principal.uid === 'anon' || principal.isAnonymous !== false) fail('UNAUTHENTICATED')
      const uid = principal.uid
      if (payload?.action === 'identify') return { ok: true, data: { userId: uid } }
      if (!payload || payload.expectedUserId !== uid) fail('IDENTITY_MISMATCH')
      if (payload.action === 'push') {
        if (!Array.isArray(payload.events) || !payload.events.length || payload.events.length > 50) fail('INVALID_BATCH')
        const events = payload.events.map(event => normalize(event, validIds, clock()))
        if (new Set(events.map(event => event.id)).size !== events.length) fail('INVALID_BATCH')
        const acceptedIds = await store.transaction(uid, async tx => {
          const meta = await tx.getMeta() || { sequence: 0 }
          if (meta.deleting) fail('ACCOUNT_DELETING')
          let sequence = meta.sequence
          if (!Number.isSafeInteger(sequence) || sequence < 0) fail('INVALID_CURSOR')
          for (const event of events) {
            const previous = await tx.getEvent(event.id)
            if (previous) { if (!sameEvent(previous.event, event)) fail('EVENT_CONFLICT') }
            else { sequence++; await tx.setEvent(event.id, { sequence, event }) }
          }
          if (!Number.isSafeInteger(sequence)) fail('INVALID_CURSOR')
          await tx.setMeta({ ...meta, sequence })
          return events.map(event => event.id)
        })
        return { ok: true, data: { userId: uid, acceptedIds } }
      }
      if (payload.action === 'pull') {
        const cursor = payload.cursor ?? '0'
        if (typeof cursor !== 'string' || !/^\d+$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) fail('INVALID_CURSOR')
        const meta = await store.getMeta(uid)
        if (meta?.deleting) fail('ACCOUNT_DELETING')
        if (Number(cursor) > (meta?.sequence ?? 0)) fail('INVALID_CURSOR')
        const rows = await store.pull(uid, Number(cursor), 200)
        return { ok: true, data: { userId: uid, events: rows.map(row => row.event), cursor: String(rows.at(-1)?.sequence ?? Number(cursor)), hasMore: rows.length === 200 } }
      }
      if (payload.action === 'erase') {
        await store.transaction(uid, async tx => {
          await tx.getMeta()
          await tx.setMeta({ sequence: 0, deleting: true })
        })
        const removed = await store.erase(uid, 100)
        return { ok: true, data: { userId: uid, hasMore: removed === 100 } }
      }
      fail('INVALID_ACTION')
    } catch (error) {
      if (error.safeCode) return { ok: false, code: error.safeCode }
      // Preserve a narrow SDK/native error category, never database messages or data.
      const diagnosticCode = typeof error.code === 'string' && /^DATABASE_[A-Z0-9_]{1,40}$/.test(error.code)
        ? error.code : error instanceof TypeError ? 'TYPE_ERROR' : 'UNEXPECTED_ERROR'
      return { ok: false, code: 'INTERNAL', diagnosticCode }
    }
  }
}
