import { readData, updateData } from '../server/github.js';
import {
	clearSessionCookie,
	methodNotAllowed,
	requireSameOrigin,
	requireSession,
	setNoStore
} from '../server/session.js';

const MAX_TEXT_LENGTHS = {
	id: 128,
	company: 120,
	site: 2000,
	offer: 4000,
	job: 4000,
	notes: 10000,
	status: 40,
	recruiterName: 120,
	referralName: 120,
	referralEmail: 254,
	referralContext: 4000,
	attachmentPath: 2048
};

function requestBody(request) {
	if (typeof request.body === 'string') return JSON.parse(request.body);
	return request.body || {};
}

function normalizeNote(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('A company record is required.');
	}
	if (typeof value.id !== 'string' || typeof value.company !== 'string') {
		throw new Error('Company name and record ID must be text.');
	}
	for (const key of Object.keys(MAX_TEXT_LENGTHS)) {
		if (key !== 'id' && value[key] != null && typeof value[key] !== 'string') {
			throw new Error(`${key} must be text.`);
		}
	}
	if (value.submittedAt != null && typeof value.submittedAt !== 'string') {
		throw new Error('Submission date must be text or null.');
	}
	const note = {
		id: String(value.id || ''),
		company: String(value.company || '').trim(),
		site: String(value.site || ''),
		offer: String(value.offer || ''),
		job: String(value.job || ''),
		notes: String(value.notes || ''),
		status: String(value.status || 'Researching'),
		source: value.source === 'recruiter-re-audit' ? value.source : 'info-hub',
		recruiterName: String(value.recruiterName || ''),
		referralName: String(value.referralName || ''),
		referralEmail: String(value.referralEmail || ''),
		referralContext: String(value.referralContext || ''),
		attachmentPath: String(value.attachmentPath || ''),
		submittedAt: value.submittedAt || null,
		updatedAt: Date.now()
	};
	if (!note.id || note.company.length === 0) throw new Error('Company name and record ID are required.');
	for (const [key, maxLength] of Object.entries(MAX_TEXT_LENGTHS)) {
		if (note[key].length > maxLength) throw new Error(`${key} must be ${maxLength} characters or fewer.`);
	}
	return note;
}

function respondWithError(response, error) {
	const status = [401, 403].includes(error.status)
		? error.status
		: error.status >= 500
			? error.status
			: 400;
	return response.status(status).json({ error: error.message || 'The shared data request failed.' });
}

export default async function handler(request, response) {
	setNoStore(response);
	if (!['GET', 'POST', 'DELETE'].includes(request.method)) return methodNotAllowed(response, ['GET', 'POST', 'DELETE']);
	const session = requireSession(request, response);
	if (!session) return;
	if (request.method !== 'GET' && !requireSameOrigin(request, response)) return;

	try {
		if (request.method === 'GET') {
			const { data } = await readData(session);
			return response.status(200).json({ notes: data.notes, skills: data.skills });
		}
		if (request.method === 'POST') {
			const body = requestBody(request);
			if (body.action === 'saveNote') {
				const note = normalizeNote(body.note);
				const data = await updateData(session, current => {
					const index = current.notes.findIndex(item => String(item.id) === note.id);
					const notes = index < 0
						? [...current.notes, note]
						: current.notes.map((item, itemIndex) => itemIndex === index ? note : item);
					return { ...current, notes };
				}, 'Update Recruiter Hub record');
				return response.status(200).json({ notes: data.notes, skills: data.skills });
			}
			if (body.action === 'saveSkills') {
				if (typeof body.skills !== 'string' || body.skills.length > 500) {
					throw new Error('Candidate skills must be 500 characters or fewer.');
				}
				const data = await updateData(session, current => ({ ...current, skills: body.skills }), 'Update Recruiter Hub skills');
				return response.status(200).json({ notes: data.notes, skills: data.skills });
			}
			throw new Error('Unknown shared data operation.');
		}
		const id = new URL(request.url, process.env.APP_URL).searchParams.get('id');
		if (!id || id.length > MAX_TEXT_LENGTHS.id) throw new Error('A valid record ID is required.');
		const data = await updateData(session, current => ({
			...current,
			notes: current.notes.filter(note => String(note.id) !== id)
		}), 'Delete Recruiter Hub record');
		return response.status(200).json({ notes: data.notes, skills: data.skills });
	} catch (error) {
		console.error('GitHub shared data request failed.', error);
		if (error.status === 401) clearSessionCookie(response);
		return respondWithError(response, error);
	}
}
