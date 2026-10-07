import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';

const SESSION_COOKIE = 'recruiterhub_session';
const STATE_COOKIE = 'recruiterhub_oauth_state';
const SESSION_TTL = 7 * 24 * 60 * 60;

function cookieValue(request, name) {
	const cookieHeader = request.headers.cookie || '';
	for (const entry of cookieHeader.split(';')) {
		const separator = entry.indexOf('=');
		if (separator < 0) continue;
		if (entry.slice(0, separator).trim() === name) {
			try {
				return decodeURIComponent(entry.slice(separator + 1).trim());
			} catch {
				return '';
			}
		}
	}
	return '';
}

function cookieOptions(maxAge) {
	const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
	return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sessionKey() {
	const secret = process.env.SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('SESSION_SECRET must contain at least 32 characters.');
	}
	return createHash('sha256').update(secret).digest();
}

function setCookie(response, name, value, maxAge) {
	const existing = response.getHeader('Set-Cookie');
	const cookies = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
	cookies.push(`${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`);
	response.setHeader('Set-Cookie', cookies);
}

export function clearOAuthState(response) {
	setCookie(response, STATE_COOKIE, '', 0);
}

export function createOAuthState(response) {
	const state = randomBytes(32).toString('hex');
	setCookie(response, STATE_COOKIE, state, 600);
	return state;
}

export function validateOAuthState(request, state) {
	const expected = cookieValue(request, STATE_COOKIE);
	if (!expected || !state || expected.length !== state.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(state));
}

export function createSessionCookie(response, session) {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', sessionKey(), iv);
	const ciphertext = Buffer.concat([
		cipher.update(JSON.stringify({ ...session, expiresAt: Date.now() + SESSION_TTL * 1000 }), 'utf8'),
		cipher.final()
	]);
	const value = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
	setCookie(response, SESSION_COOKIE, value, SESSION_TTL);
}

export function clearSessionCookie(response) {
	setCookie(response, SESSION_COOKIE, '', 0);
}

export function readSession(request) {
	const value = cookieValue(request, SESSION_COOKIE);
	if (!value) return null;
	try {
		const payload = Buffer.from(value, 'base64url');
		if (payload.length < 29) return null;
		const decipher = createDecipheriv('aes-256-gcm', sessionKey(), payload.subarray(0, 12));
		decipher.setAuthTag(payload.subarray(12, 28));
		const session = JSON.parse(Buffer.concat([
			decipher.update(payload.subarray(28)),
			decipher.final()
		]).toString('utf8'));
		if (!session.login || !session.token || session.expiresAt <= Date.now()) return null;
		return session;
	} catch {
		return null;
	}
}

export function oauthConfigurationIssues() {
	const required = [
		'APP_URL',
		'GITHUB_CLIENT_ID',
		'GITHUB_CLIENT_SECRET',
		'GITHUB_ALLOWED_USERS',
		'GITHUB_REPOSITORY',
		'SESSION_SECRET'
	];
	const issues = required.filter(name => !process.env[name]?.trim());
	if ((process.env.SESSION_SECRET || '').length < 32 && !issues.includes('SESSION_SECRET')) {
		issues.push('SESSION_SECRET (at least 32 characters)');
	}
	if (process.env.GITHUB_REPOSITORY && !/^[^/]+\/[^/]+$/.test(process.env.GITHUB_REPOSITORY)) {
		issues.push('GITHUB_REPOSITORY (use owner/repository)');
	}
	if (process.env.GITHUB_ALLOWED_USERS && !process.env.GITHUB_ALLOWED_USERS.split(',').some(user => user.trim())) {
		issues.push('GITHUB_ALLOWED_USERS (add at least one GitHub login)');
	}
	if (process.env.APP_URL) {
		try {
			const appUrl = new URL(process.env.APP_URL);
			if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
				issues.push('APP_URL (use only the canonical origin, with no path)');
			}
			if (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
				issues.push('APP_URL (production must use HTTPS)');
			}
		} catch {
			issues.push('APP_URL (use a valid http:// or https:// origin)');
		}
	}
	return issues;
}

export function isOAuthConfigured() {
	return oauthConfigurationIssues().length === 0;
}

export function isAllowedUser(login) {
	const allowedUsers = (process.env.GITHUB_ALLOWED_USERS || '')
		.split(',')
		.map(user => user.trim().toLowerCase())
		.filter(Boolean);
	return allowedUsers.includes(String(login).toLowerCase());
}

export function requireSession(request, response) {
	const session = readSession(request);
	if (!session || !isAllowedUser(session.login)) {
		response.status(401).json({ error: 'Sign in with an authorized GitHub account to continue.' });
		return null;
	}
	return session;
}

export function requireSameOrigin(request, response) {
	const origin = request.headers.origin;
	try {
		if (origin && new URL(origin).origin === new URL(process.env.APP_URL).origin) return true;
	} catch {
		// Return the same response for missing or malformed deployment configuration.
	}
	response.status(403).json({ error: 'This request did not come from the configured application origin.' });
	return false;
}

export function setNoStore(response) {
	response.setHeader('Cache-Control', 'no-store, private');
}

export function methodNotAllowed(response, allowed) {
	response.setHeader('Allow', allowed.join(', '));
	response.status(405).json({ error: `Use ${allowed.join(' or ')} for this endpoint.` });
}
