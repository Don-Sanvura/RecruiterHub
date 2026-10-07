import {
	clearSessionCookie,
	methodNotAllowed,
	requireSameOrigin,
	setNoStore
} from '../../server/session.js';

export default function handler(request, response) {
	setNoStore(response);
	if (request.method !== 'POST') return methodNotAllowed(response, ['POST']);
	if (!requireSameOrigin(request, response)) return;
	clearSessionCookie(response);
	return response.status(200).json({ authenticated: false });
}
