import {
	isAllowedUser,
	isOAuthConfigured,
	methodNotAllowed,
	oauthConfigurationIssues,
	readSession,
	setNoStore
} from '../../server/session.js';

export default function handler(request, response) {
	setNoStore(response);
	if (request.method !== 'GET') return methodNotAllowed(response, ['GET']);
	const session = readSession(request);
	const authorized = Boolean(session && isAllowedUser(session.login));
	return response.status(200).json({
		configured: isOAuthConfigured(),
		configurationIssues: oauthConfigurationIssues(),
		authenticated: authorized,
		login: authorized ? session.login : null
	});
}
