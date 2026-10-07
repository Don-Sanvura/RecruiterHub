export async function apiRequest(path, options = {}) {
	const response = await fetch(path, {
		...options,
		credentials: 'same-origin',
		headers: {
			...(options.body ? { 'Content-Type': 'application/json' } : {}),
			...options.headers
		}
	});
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.error || `Request failed with status ${response.status}.`);
	}
	if (response.status === 204) return null;
	const contentType = response.headers.get('Content-Type') || '';
	if (!contentType.includes('application/json')) return response;
	return response.json();
}

export function requestBody(body) {
	return JSON.stringify(body);
}
