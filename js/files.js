import { apiRequest, requestBody } from './api.js';

const DATABASE_NAME = 'recruiter-hub-files';
const STORE_NAME = 'attachments';
const MAX_FILE_SIZE = 700 * 1024;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'text/plain']);
const ALLOWED_FILE_EXTENSIONS = new Set(['.pdf', '.txt', '.doc', '.docx']);
let databasePromise;

function openDatabase() {
	if (!('indexedDB' in window)) {
		return Promise.reject(new Error('This browser does not support local attachment storage.'));
	}
	if (!databasePromise) {
		databasePromise = new Promise((resolve, reject) => {
			const request = indexedDB.open(DATABASE_NAME, 1);
			request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error || new Error('Could not open local attachment storage.'));
			request.onblocked = () => reject(new Error('Local attachment storage is blocked by another browser tab.'));
		});
	}
	return databasePromise;
}

function localFile(path) {
	return openDatabase().then(database => new Promise((resolve, reject) => {
		const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(path);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Could not read a locally saved attachment.'));
	}));
}

function validateFile(file) {
	const extension = `.${file.name.split('.').pop().toLowerCase()}`;
	if (!ALLOWED_FILE_EXTENSIONS.has(extension)) throw new Error('Choose a PDF, DOC, DOCX, or TXT file.');
	if (file.size > MAX_FILE_SIZE) throw new Error('Attachments must be 700 KB or smaller to fit the GitHub repository API limit.');
	if (file.type && !ALLOWED_FILE_TYPES.has(file.type) && !['.doc', '.docx'].includes(extension)) {
		throw new Error('This file type is not supported.');
	}
}

function toBase64(buffer) {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary);
}

export async function uploadSharedFile(file) {
	validateFile(file);
	const result = await apiRequest('/api/attachments', {
		method: 'POST',
		body: requestBody({ filename: file.name, content: toBase64(await file.arrayBuffer()) })
	});
	return result.path;
}

export async function uploadLegacyAttachment(path, noteId) {
	const file = await localFile(path);
	if (!file) throw new Error(`The locally saved attachment for record ${noteId} is unavailable for migration.`);
	return uploadSharedFile(file);
}

export async function getSharedFileUrl(path) {
	if (/^https?:\/\//i.test(path)) return path;
	const repositoryPath = path.startsWith('github:') ? path.slice('github:'.length) : path;
	const response = await apiRequest(`/api/attachments?path=${encodeURIComponent(repositoryPath)}`);
	const url = URL.createObjectURL(await response.blob());
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
	return url;
}

export async function deleteSharedFile(path) {
	if (!path || /^https?:\/\//i.test(path)) return;
	const repositoryPath = path.startsWith('github:') ? path.slice('github:'.length) : path;
	await apiRequest('/api/attachments', {
		method: 'DELETE',
		body: requestBody({ path: repositoryPath })
	});
}
