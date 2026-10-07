const GITHUB_API = 'https://api.github.com';
const MAX_DATA_BYTES = 900_000;
const DATA_PATH = '.recruiterhub/data.json';
const DEFAULT_SKILLS = 'full-stack engineering, AI/LLM integration, shipping fast';

function repositoryConfig() {
	const [owner, repo, ...extra] = (process.env.GITHUB_REPOSITORY || '').split('/');
	if (!owner || !repo || extra.length) throw new Error('Set GITHUB_REPOSITORY to owner/repository.');
	return { owner, repo, branch: process.env.GITHUB_BRANCH || 'main' };
}

function contentUrl(path) {
	const { owner, repo, branch } = repositoryConfig();
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	return `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
}

async function ensureRepositoryAccess(session) {
	const { owner, repo } = repositoryConfig();
	const repository = await githubRequest(session, `${GITHUB_API}/repos/${owner}/${repo}`);
	if (!repository) {
		const error = new Error('The signed-in GitHub account cannot access GITHUB_REPOSITORY. Check the repository name and OAuth access.');
		error.status = 403;
		throw error;
	}
}

async function githubRequest(session, url, options = {}) {
	let response;
	try {
		response = await fetch(url, {
			...options,
			headers: {
				Accept: 'application/vnd.github+json',
				Authorization: `Bearer ${session.token}`,
				'X-GitHub-Api-Version': '2022-11-28',
				...(options.body ? { 'Content-Type': 'application/json' } : {}),
				...options.headers
			}
		});
	} catch (error) {
		error.status = 502;
		throw error;
	}
	if (response.ok) return response;
	const details = await response.json().catch(() => ({}));
	if (response.status === 404) return null;
	const error = new Error(details.message || `GitHub API request failed (${response.status}).`);
	error.status = response.status;
	throw error;
}

async function readRepositoryFile(session, path) {
	const response = await githubRequest(session, contentUrl(path));
	if (!response) return null;
	const file = await response.json();
	if (file.type !== 'file' || typeof file.content !== 'string') {
		throw new Error(`The repository file ${path} is not available as a regular file.`);
	}
	return {
		sha: file.sha,
		content: Buffer.from(file.content.replace(/\s/g, ''), 'base64')
	};
}

export async function readData(session) {
	await ensureRepositoryAccess(session);
	const file = await readRepositoryFile(session, DATA_PATH);
	if (!file) return { sha: null, data: { version: 1, notes: [], skills: DEFAULT_SKILLS, updatedAt: Date.now() } };
	if (file.content.length > MAX_DATA_BYTES) {
		throw new Error('The shared data file exceeds the safe size limit. Split the data before making further changes.');
	}
	let data;
	try {
		data = JSON.parse(file.content.toString('utf8'));
	} catch {
		throw new Error('The shared repository data file contains invalid JSON.');
	}
	if (
		data.version !== 1 ||
		!Array.isArray(data.notes) ||
		!data.notes.every(note => note && typeof note === 'object' && typeof note.id === 'string') ||
		typeof data.skills !== 'string' ||
		data.skills.length > 500
	) {
		throw new Error('The shared repository data file has an unsupported format.');
	}
	return { sha: file.sha, data };
}

export async function updateData(session, update, message) {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		const { sha, data } = await readData(session);
		const next = update(data);
		if (JSON.stringify(data.notes) === JSON.stringify(next.notes) && data.skills === next.skills) {
			return data;
		}
		const content = Buffer.from(JSON.stringify({
			version: 1,
			notes: next.notes,
			skills: next.skills,
			updatedAt: Date.now()
		}), 'utf8');
		if (content.length > MAX_DATA_BYTES) {
			throw new Error('The shared data reached its 900 KB limit. Remove records or attachments before saving more.');
		}
		try {
			const response = await githubRequest(session, `${GITHUB_API}/repos/${repositoryConfig().owner}/${repositoryConfig().repo}/contents/${DATA_PATH.split('/').map(encodeURIComponent).join('/')}`, {
				method: 'PUT',
				body: JSON.stringify({
					message,
					content: content.toString('base64'),
					branch: repositoryConfig().branch,
					...(sha ? { sha } : {})
				})
			});
			if (!response) throw new Error('GitHub could not update the shared data file.');
			return next;
		} catch (error) {
			if (![409, 422].includes(error.status) || attempt === 2) {
				if ([409, 422].includes(error.status)) {
					throw new Error('Another update conflicted with this save. Please retry the change.');
				}
				throw error;
			}
		}
	}
	throw new Error('Could not save the shared data after repeated update conflicts.');
}

export async function writeRepositoryFile(session, path, content, message) {
	await ensureRepositoryAccess(session);
	const existing = await readRepositoryFile(session, path);
	const { owner, repo, branch } = repositoryConfig();
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	const response = await githubRequest(session, `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`, {
		method: 'PUT',
		body: JSON.stringify({
			message,
			content: Buffer.from(content).toString('base64'),
			branch,
			...(existing ? { sha: existing.sha } : {})
		})
	});
	if (!response) throw new Error('GitHub could not save the attachment.');
}

export async function deleteRepositoryFile(session, path) {
	await ensureRepositoryAccess(session);
	const existing = await readRepositoryFile(session, path);
	if (!existing) return;
	const { owner, repo, branch } = repositoryConfig();
	const encodedPath = path.split('/').map(encodeURIComponent).join('/');
	const response = await githubRequest(session, `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`, {
		method: 'DELETE',
		body: JSON.stringify({
			message: 'Delete Recruiter Hub attachment',
			sha: existing.sha,
			branch
		})
	});
	if (!response) throw new Error('GitHub could not delete the attachment.');
}

export async function readRepositoryAttachment(session, path) {
	await ensureRepositoryAccess(session);
	return readRepositoryFile(session, path);
}

export function attachmentPath(filename) {
	return `attachments/${filename}`;
}

export function attachmentMimeType(filename) {
	const extension = filename.toLowerCase().split('.').pop();
	return {
		pdf: 'application/pdf',
		txt: 'text/plain; charset=utf-8',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	}[extension] || 'application/octet-stream';
}
