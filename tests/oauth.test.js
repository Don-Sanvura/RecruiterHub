import assert from 'node:assert/strict';
import { test } from 'node:test';

import callbackHandler from '../api/auth/callback.js';
import loginHandler from '../api/auth/login.js';
import sessionHandler from '../api/auth/session.js';
import { readSession } from '../server/session.js';

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };

function response() {
	return {
		statusCode: 200,
		headers: {},
		status(code) { this.statusCode = code; return this; },
		setHeader(name, value) { this.headers[name] = value; },
		getHeader(name) { return this.headers[name]; },
		json(value) { this.body = value; return this; },
		send(value) { this.body = value; return this; },
		redirect(code, location) { this.statusCode = code; this.location = location; return this; }
	};
}

test('OAuth callback allows only the configured GitHub user and encrypts the session', async () => {
	Object.assign(process.env, {
		NODE_ENV: 'production',
		APP_URL: 'https://recruiterhub.example',
		GITHUB_CLIENT_ID: 'oauth-client-id',
		GITHUB_CLIENT_SECRET: 'oauth-client-secret',
		GITHUB_ALLOWED_USERS: 'Don-Sanvura',
		GITHUB_REPOSITORY: 'Don-Sanvura/my-project-app',
		SESSION_SECRET: 'oauth-test-secret-with-at-least-32-characters'
	});
	globalThis.fetch = async (url, options = {}) => {
		if (String(url) === 'https://github.com/login/oauth/access_token') {
			assert.equal(options.method, 'POST');
			return Response.json({ access_token: 'private-github-token' });
		}
		assert.equal(String(url), 'https://api.github.com/user');
		return Response.json({ login: 'Don-Sanvura' });
	};

	try {
		const loginResponse = response();
		loginHandler({ method: 'GET' }, loginResponse);
		assert.equal(loginResponse.statusCode, 302);
		const authorizationUrl = new URL(loginResponse.location);
		assert.equal(authorizationUrl.searchParams.get('redirect_uri'), 'https://recruiterhub.example/api/auth/callback');
		assert.equal(authorizationUrl.searchParams.get('scope'), 'repo');
		const stateCookie = loginResponse.headers['Set-Cookie'][0].split(';')[0];
		const [cookieName, cookieValue] = stateCookie.split('=');

		const callbackResponse = response();
		await callbackHandler({
			method: 'GET',
			url: `/api/auth/callback?code=authorization-code&state=${authorizationUrl.searchParams.get('state')}`,
			headers: { cookie: `${cookieName}=${cookieValue}` }
		}, callbackResponse);
		assert.equal(callbackResponse.statusCode, 302);
		assert.equal(callbackResponse.location, '/');
		const sessionHeader = callbackResponse.headers['Set-Cookie'].find(cookie => cookie.startsWith('recruiterhub_session='));
		assert.ok(sessionHeader);
		assert.match(sessionHeader, /HttpOnly/);
		assert.match(sessionHeader, /Secure/);
		assert.doesNotMatch(sessionHeader, /private-github-token/);
		const sessionCookie = sessionHeader.split(';')[0];
		const session = readSession({ headers: { cookie: sessionCookie } });
		assert.equal(session.login, 'Don-Sanvura');
		assert.equal(session.token, 'private-github-token');

		const sessionResponse = response();
		sessionHandler({ method: 'GET', headers: { cookie: sessionCookie } }, sessionResponse);
		assert.deepEqual(sessionResponse.body, {
			configured: true,
			configurationIssues: [],
			authenticated: true,
			login: 'Don-Sanvura'
		});

		process.env.GITHUB_ALLOWED_USERS = 'another-user';
		const deniedResponse = response();
		sessionHandler({ method: 'GET', headers: { cookie: sessionCookie } }, deniedResponse);
		assert.equal(deniedResponse.body.authenticated, false);
	} finally {
		globalThis.fetch = originalFetch;
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnvironment)) delete process.env[key];
		}
		Object.assign(process.env, originalEnvironment);
	}
});
