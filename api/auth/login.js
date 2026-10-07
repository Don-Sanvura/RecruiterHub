import { createOAuthState, isOAuthConfigured, methodNotAllowed, setNoStore } from '../../server/session.js';

export default function handler(request, response) {
	setNoStore(response);
	if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
	if (!isOAuthConfigured()) {
		return response.status(503).json({ error: 'GitHub OAuth is not configured. Set the server environment variables described in README.md.' });
	}
	const state = createOAuthState(response);
	const redirect = new URL('https://github.com/login/oauth/authorize');
	redirect.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
	redirect.searchParams.set('redirect_uri', `${process.env.APP_URL.replace(/\/$/, '')}/api/auth/callback`);
	redirect.searchParams.set('scope', 'repo');
	redirect.searchParams.set('state', state);
	return response.redirect(302, redirect.toString());
}
