import { randomUUID } from 'node:crypto';
import {
	attachmentMimeType,
	attachmentPath,
	deleteRepositoryFile,
	readRepositoryAttachment,
	writeRepositoryFile
} from '../server/github.js';
import {
	clearSessionCookie,
	methodNotAllowed,
	requireSameOrigin,
	requireSession,
	setNoStore
} from '../server/session.js';

const MAX_ATTACHMENT_BYTES = 700 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'txt', 'doc', 'docx']);

function requestBody(request) {
	if (typeof request.body === 'string') return JSON.parse(request.body);
	return request.body || {};
}

function safeAttachmentPath(value) {
	if (typeof value !== 'string' || !/^attachments\/[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,120}$/.test(value)) {
		throw new Error('The attachment path is invalid.');
	}
	return value;
}

function respondWithError(response, error) {
	const status = [401, 403].includes(error.status)
		? error.status
		: error.status >= 500
			? error.status
			: 400;
	return response.status(status).json({ error: error.message || 'The attachment request failed.' });
}

export default async function handler(request, response) {
	setNoStore(response);
	if (!['GET', 'POST', 'DELETE'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'DELETE']);
	const session = requireSession(request, response);
	if (!session) return;
	if (request.method !== 'GET' && !requireSameOrigin(request, response)) return;

	try {
		if (request.method === 'GET') {
			const path = safeAttachmentPath(new URL(request.url, process.env.APP_URL).searchParams.get('path'));
			const file = await readRepositoryAttachment(session, path);
			if (!file) return response.status(404).json({ error: 'This attachment is not in the configured GitHub repository.' });
			const filename = path.split('/').pop();
			const disposition = ['doc', 'docx'].some(extension => filename.toLowerCase().endsWith(`.${extension}`))
				? 'attachment'
				: 'inline';
			response.setHeader('Content-Type', attachmentMimeType(filename));
			response.setHeader('Content-Disposition', `${disposition}; filename="${filename.replace(/["\\]/g, '_')}"`);
			return response.status(200).send(file.content);
		}
		if (request.method === 'POST') {
			const body = requestBody(request);
			const filename = String(body.filename || '').split(/[\\/]/).pop();
			const extension = filename.toLowerCase().split('.').pop();
			if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Choose a PDF, DOC, DOCX, or TXT file.');
			if (typeof body.content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.content)) {
				throw new Error('The attachment upload is not valid base64 data.');
			}
			const content = Buffer.from(body.content, 'base64');
			if (!content.length || content.length > MAX_ATTACHMENT_BYTES) {
				throw new Error('Attachments must be 700 KB or smaller.');
			}
			const path = attachmentPath(`${randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)}`);
			await writeRepositoryFile(session, path, content, 'Add Recruiter Hub attachment');
			return response.status(201).json({ path: `github:${path}` });
		}
		const path = safeAttachmentPath(requestBody(request).path);
		await deleteRepositoryFile(session, path);
		return response.status(200).json({ deleted: true });
	} catch (error) {
		console.error('GitHub attachment request failed.', error);
		if (error.status === 401) clearSessionCookie(response);
		return respondWithError(response, error);
	}
}
