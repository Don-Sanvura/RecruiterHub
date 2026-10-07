import assert from 'node:assert/strict';
import { test } from 'node:test';

import dataHandler from '../api/data.js';
import attachmentsHandler from '../api/attachments.js';
import { createSessionCookie } from '../server/session.js';

const originalFetch = globalThis.fetch;
const originalEnvironment = { ...process.env };
const files = new Map();
let nextSha = 0;

function response() {
	return {
		statusCode: 200,
		headers: {},
		status(code) { this.statusCode = code; return this; },
		setHeader(name, value) { this.headers[name] = value; },
		getHeader(name) { return this.headers[name]; },
		json(value) { this.body = value; return this; },
		send(value) { this.body = value; return this; }
	};
}

function request(method, url, cookie, body, origin = 'http://localhost:3000') {
	return {
		method,
		url,
		body,
		headers: {
			...(cookie ? { cookie } : {}),
			...(origin ? { origin } : {})
		}
	};
}

function repositoryPath(url) {
	return decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
}

test('GitHub API secures and persists shared records and attachments', async () => {
	Object.assign(process.env, {
		NODE_ENV: 'test',
		APP_URL: 'http://localhost:3000',
		GITHUB_CLIENT_ID: 'test-client',
		GITHUB_CLIENT_SECRET: 'test-secret',
		GITHUB_ALLOWED_USERS: 'Don-Sanvura',
		GITHUB_REPOSITORY: 'Don-Sanvura/my-project-app',
		GITHUB_BRANCH: 'main',
		SESSION_SECRET: 'test-session-secret-with-at-least-32-characters'
	});

	globalThis.fetch = async (input, options = {}) => {
		const url = new URL(input);
		if (url.pathname === '/repos/Don-Sanvura/my-project-app') {
			return Response.json({ full_name: 'Don-Sanvura/my-project-app' });
		}
		const path = repositoryPath(url);
		if (options.method === 'PUT') {
			const body = JSON.parse(options.body);
			const current = files.get(path);
			if ((current && current.sha !== body.sha) || (!current && body.sha)) {
				return Response.json({ message: 'sha does not match' }, { status: 409 });
			}
			const stored = { sha: `sha-${++nextSha}`, content: Buffer.from(body.content, 'base64') };
			files.set(path, stored);
			return Response.json({ content: { sha: stored.sha } });
		}
		if (options.method === 'DELETE') {
			const current = files.get(path);
			if (!current || current.sha !== JSON.parse(options.body).sha) {
				return Response.json({ message: 'sha does not match' }, { status: 409 });
			}
			files.delete(path);
			return Response.json({ content: null });
		}
		const file = files.get(path);
		return file
			? Response.json({ type: 'file', sha: file.sha, content: file.content.toString('base64') })
			: Response.json({ message: 'Not Found' }, { status: 404 });
	};

	try {
		const sessionResponse = response();
		createSessionCookie(sessionResponse, { token: 'test-github-token', login: 'Don-Sanvura' });
		const sessionCookie = sessionResponse.headers['Set-Cookie'][0].split(';')[0];

		const unauthorized = response();
		await dataHandler(request('GET', '/api/data', ''), unauthorized);
		assert.equal(unauthorized.statusCode, 401);

		const initial = response();
		await dataHandler(request('GET', '/api/data', sessionCookie), initial);
		assert.equal(initial.statusCode, 200);
		assert.deepEqual(initial.body.notes, []);

		const note = {
			id: 'record-1',
			company: 'Example Co',
			source: 'info-hub',
			status: 'Researching'
		};
		const saved = response();
		await dataHandler(request('POST', '/api/data', sessionCookie, { action: 'saveNote', note }), saved);
		assert.equal(saved.statusCode, 200);
		assert.equal(saved.body.notes[0].company, 'Example Co');

		const crossOrigin = response();
		await dataHandler(request('POST', '/api/data', sessionCookie, {
			action: 'saveSkills',
			skills: 'tampered'
		}, 'https://attacker.example'), crossOrigin);
		assert.equal(crossOrigin.statusCode, 403);

		const skills = response();
		await dataHandler(request('POST', '/api/data', sessionCookie, {
			action: 'saveSkills',
			skills: 'TypeScript, recruiting'
		}), skills);
		assert.equal(skills.body.skills, 'TypeScript, recruiting');
		assert.equal(skills.body.notes[0].company, 'Example Co');

		const uploaded = response();
		await attachmentsHandler(request('POST', '/api/attachments', sessionCookie, {
			filename: 'resume.txt',
			content: Buffer.from('hello attachment').toString('base64')
		}), uploaded);
		assert.equal(uploaded.statusCode, 201);
		const storedPath = uploaded.body.path.slice('github:'.length);

		const originalConsoleError = console.error;
		try {
			console.error = () => {};
			const oversized = response();
			await attachmentsHandler(request('POST', '/api/attachments', sessionCookie, {
				filename: 'too-large.txt',
				content: Buffer.alloc(700 * 1024 + 1).toString('base64')
			}), oversized);
			assert.equal(oversized.statusCode, 400);
		} finally {
			console.error = originalConsoleError;
		}

		const downloaded = response();
		await attachmentsHandler(request('GET', `/api/attachments?path=${encodeURIComponent(storedPath)}`, sessionCookie), downloaded);
		assert.equal(downloaded.statusCode, 200);
		assert.equal(downloaded.body.toString(), 'hello attachment');

		const removed = response();
		await dataHandler(request('DELETE', '/api/data?id=record-1', sessionCookie), removed);
		assert.equal(removed.body.notes.length, 0);

		const removedAttachment = response();
		await attachmentsHandler(request('DELETE', '/api/attachments', sessionCookie, { path: storedPath }), removedAttachment);
		assert.deepEqual(removedAttachment.body, { deleted: true });
	} finally {
		globalThis.fetch = originalFetch;
		for (const key of Object.keys(process.env)) {
			if (!(key in originalEnvironment)) delete process.env[key];
		}
		Object.assign(process.env, originalEnvironment);
		files.clear();
	}
});
