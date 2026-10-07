import {
	clearOAuthState,
	createSessionCookie,
	isAllowedUser,
	isOAuthConfigured,
	methodNotAllowed,
	setNoStore,
	validateOAuthState
} from '../../server/session.js';

async function githubJson(url, options) {
	const response = await fetch(url, {
		...options,
		headers: { Accept: 'application/json', ...options.headers }
	});
	const body = await response.json().catch(() => ({}));
	if (!response.ok) throw new Error(body.error_description || body.message || 'GitHub sign-in failed.');
	return body;
}

export default async function handler(request, response) {
	setNoStore(response);
	if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
	if (!isOAuthConfigured()) {
		return response.status(503).send('GitHub OAuth is not configured. Set the server environment variables described in README.md.');
	}
	const url = new URL(request.url, `${process.env.APP_URL}`);
	const state = url.searchParams.get('state');
	clearOAuthState(response);
	if (url.searchParams.has('error')) {
		return response.redirect(302, '/?auth=denied');
	}
	if (!validateOAuthState(request, state)) {
		return response.status(400).send('GitHub sign-in could not be verified. Start again from the app.');
	}
	const code = url.searchParams.get('code');
	if (!code) return response.status(400).send('GitHub did not return an authorization code.');

	try {
		const tokenResponse = await githubJson('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_id: process.env.GITHUB_CLIENT_ID,
				client_secret: process.env.GITHUB_CLIENT_SECRET,
				code,
				redirect_uri: `${process.env.APP_URL.replace(/\/$/, '')}/api/auth/callback`
			})
		});
		if (!tokenResponse.access_token) throw new Error('GitHub did not provide an access token.');
		const user = await githubJson('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${tokenResponse.access_token}`,
				'X-GitHub-Api-Version': '2022-11-28'
			}
		});
		if (!isAllowedUser(user.login)) return response.redirect(302, '/?auth=unauthorized');
		createSessionCookie(response, { token: tokenResponse.access_token, login: user.login });
		return response.redirect(302, '/');
	} catch (error) {
		console.error('GitHub OAuth callback failed.', error);
		return response.status(502).send('GitHub sign-in could not be completed. Return to the app and try again.');
	}
}
