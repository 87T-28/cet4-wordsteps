const { randomBytes, createHash, timingSafeEqual } = require('node:crypto')
const TTL = 5 * 60 * 1000
const fail = code => { const error = new Error(code); error.safeCode = code; throw error }
const digest = token => createHash('sha256').update(token).digest('hex')
const tokenMatches = (token, stored) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
  && typeof stored === 'string' && /^[a-f0-9]{64}$/.test(stored)
  && timingSafeEqual(Buffer.from(digest(token), 'hex'), Buffer.from(stored, 'hex'))

// Preserve application fields without copying database-managed _id into set().
function metadata(meta, changes = {}) {
  return { sequence: meta?.sequence ?? 0,
    ...(meta?.deleting === true ? { deleting: true } : {}),
    ...(meta?.deletionChallenge ? { deletionChallenge: meta.deletionChallenge } : {}),
    ...(meta?.deletionGrant ? { deletionGrant: meta.deletionGrant } : {}), ...changes }
}

exports.metadata = metadata
exports.createDeletionActions = function (store, provider, clock) {
  return {
    async request(uid, accessToken) {
      if (!provider) fail('DELETE_PROVIDER_UNAVAILABLE')
      if (typeof accessToken !== 'string' || !/^[A-Za-z0-9._-]{1,8192}$/.test(accessToken)) fail('DELETION_VERIFICATION_REQUIRED')
      const profile = await provider.getProfile(accessToken)
      if (profile?.id !== uid) fail('IDENTITY_MISMATCH')
      // Use the authenticated account contact, never an email supplied by the caller.
      if (typeof profile.email !== 'string' || profile.email.length > 254
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail('DELETE_EMAIL_UNAVAILABLE')
      const ticket = randomBytes(32).toString('hex')
      const now = clock(), ticketHash = digest(ticket)
      await store.transaction(uid, async tx => {
        const previous = await tx.getMeta()
        if (previous?.deletionChallenge?.sentAt > now - 60000) fail('DELETION_CODE_THROTTLED')
        await tx.setMeta(metadata(previous, { deletionGrant: null,
          deletionChallenge: { ticketHash, sentAt: now, expiresAt: now + TTL, attempts: 0, verificationId: '' } }))
      })
      const verificationId = await provider.sendVerification(profile.email, accessToken)
      if (typeof verificationId !== 'string' || !verificationId || verificationId.length > 512) fail('DELETE_CHALLENGE_UNAVAILABLE')
      await store.transaction(uid, async tx => {
        const meta = await tx.getMeta()
        if (!tokenMatches(ticket, meta?.deletionChallenge?.ticketHash)) fail('DELETION_VERIFICATION_REQUIRED')
        await tx.setMeta(metadata(meta, { deletionChallenge: { ...meta.deletionChallenge, verificationId } }))
      })
      return { challenge: ticket }
    },
    async authorize(uid, ticket, code, accessToken) {
      if (!provider) fail('DELETE_PROVIDER_UNAVAILABLE')
      if (typeof accessToken !== 'string' || !/^[A-Za-z0-9._-]{1,8192}$/.test(accessToken)) fail('DELETION_VERIFICATION_REQUIRED')
      const profile = await provider.getProfile(accessToken)
      if (profile?.id !== uid) fail('IDENTITY_MISMATCH')
      if (typeof code !== 'string' || !/^\d{4,8}$/.test(code)) fail('DELETION_CODE_INVALID')
      const verificationId = await store.transaction(uid, async tx => {
        const meta = await tx.getMeta(), challenge = meta?.deletionChallenge
        if (!challenge || !tokenMatches(ticket, challenge.ticketHash) || !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt <= clock()
          || !challenge.verificationId || challenge.consumed || !Number.isInteger(challenge.attempts)
          || challenge.attempts < 0 || challenge.attempts >= 5) fail('DELETION_VERIFICATION_REQUIRED')
        await tx.setMeta(metadata(meta, { deletionChallenge: { ...challenge, attempts: challenge.attempts + 1 } }))
        return challenge.verificationId
      })
      const verificationToken = await provider.verify(verificationId, code)
      if (typeof verificationToken !== 'string' || !verificationToken || verificationToken.length > 8192) fail('DELETION_CODE_INVALID')
      const sudoToken = await provider.sudo(verificationToken, accessToken)
      if (typeof sudoToken !== 'string' || !sudoToken || sudoToken.length > 8192) fail('DELETION_VERIFICATION_REQUIRED')
      const grant = randomBytes(32).toString('hex')
      await store.transaction(uid, async tx => {
        const meta = await tx.getMeta(), challenge = meta?.deletionChallenge
        if (!challenge || !tokenMatches(ticket, challenge.ticketHash) || !Number.isSafeInteger(challenge.expiresAt) || challenge.expiresAt <= clock() || challenge.consumed) fail('DELETION_VERIFICATION_REQUIRED')
        await tx.setMeta(metadata(meta, { deletionChallenge: { ...challenge, consumed: true },
          deletionGrant: { hash: digest(grant), expiresAt: clock() + TTL } }))
      })
      return { grant, sudoToken }
    },
    async startErase(uid, grant) {
      await store.transaction(uid, async tx => {
        const meta = await tx.getMeta()
        if (!tokenMatches(grant, meta?.deletionGrant?.hash) || !Number.isSafeInteger(meta.deletionGrant.expiresAt) || meta.deletionGrant.expiresAt <= clock()) fail('DELETION_VERIFICATION_REQUIRED')
        await tx.setMeta(metadata(meta, { sequence: 0, deleting: true }))
      })
    },
    async finishErase(uid, grant) {
      await store.transaction(uid, async tx => {
        const meta = await tx.getMeta()
        if (tokenMatches(grant, meta?.deletionGrant?.hash)) {
          await tx.setMeta({ sequence: 0, deleting: true, deletionGrant: meta.deletionGrant })
        }
      })
    },
  }
}

exports.createDeletionProvider = function (envId, transport = fetch) {
  async function request(route, body, accessToken, failure = 'DELETION_AUTH_UNAVAILABLE') {
    if (typeof envId !== 'string' || !/^[a-zA-Z0-9-]{5,100}$/.test(envId)) fail('DELETE_ENV_UNAVAILABLE')
    const url = `https://${envId}.api.tcloudbasegateway.com/auth/v1/${route}?client_id=${envId}`
    try {
      const response = await transport(url, { method: body ? 'POST' : 'GET', redirect: 'error',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000) })
      const text = await response.text()
      if (text.length > 65536) fail(failure)
      const data = JSON.parse(text)
      if (!response.ok || !data || data.error || data.error_code || data.code) {
        const code = data?.error || data?.code
        const detail = typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,31}$/.test(code) ? code : 'HTTP_' + response.status
        fail(failure + '.' + detail)
      }
      return data
    } catch (error) {
      if (error.safeCode) throw error
      const code = error.cause?.code ?? error.code
      const detail = typeof code === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(code)
        ? code : ['TimeoutError', 'AbortError'].includes(error.name) ? 'TIMEOUT' : error instanceof SyntaxError ? 'INVALID_RESPONSE' : 'UNREACHABLE'
      fail(failure + '.' + detail)
    }
  }
  return {
    async getProfile(accessToken) {
      const profile = await request('user/me', undefined, accessToken, 'DELETE_PROFILE')
      return { id: profile.sub || profile.uid, email: profile.email }
    },
    async sendVerification(email, accessToken) {
      const result = await request('verification', { target: 'USER', usage: 'reauthentication', email }, accessToken, 'DELETE_SEND')
      return result.verification_id
    },
    async verify(verificationId, code) {
      const result = await request('verification/verify', { verification_id: verificationId, verification_code: code }, undefined, 'DELETE_VERIFY')
      return result.verification_token
    },
    async sudo(verificationToken, accessToken) {
      const result = await request('user/sudo', { verification_token: verificationToken }, accessToken, 'DELETE_SUDO')
      return result.sudo_token
    },
  }
}
