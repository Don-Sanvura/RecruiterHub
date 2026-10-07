import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { fileStorage, firebaseConfigured } from './firebase-client.js';

const DATABASE_NAME = 'recruiter-hub-files';
const STORE_NAME = 'attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
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
	if (file.size > MAX_FILE_SIZE) throw new Error('Attachments must be 10 MB or smaller.');
	if (file.type && !ALLOWED_FILE_TYPES.has(file.type) && !['.doc', '.docx'].includes(extension)) {
		throw new Error('This file type is not supported.');
	}
}

function sanitizeFilename(filename) {
	return filename.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment';
}

export async function uploadSharedFile(file) {
	if (!firebaseConfigured || !fileStorage) throw new Error('Firebase Storage is not configured.');
	validateFile(file);
	const object = ref(fileStorage, `attachments/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`);
	await uploadBytes(object, file, { contentType: file.type || 'application/octet-stream' });
	return getDownloadURL(object);
}

export async function uploadLegacyAttachment(path, noteId) {
	const file = await localFile(path);
	if (!file) throw new Error(`The locally saved attachment for record ${noteId} is unavailable for migration.`);
	return uploadSharedFile(file);
}

export async function getSharedFileUrl(path) {
	if (!firebaseConfigured || !fileStorage) throw new Error('Firebase Storage is not configured.');
	if (/^https?:\/\//i.test(path)) return path;
	return getDownloadURL(ref(fileStorage, path));
}

export async function deleteSharedFile(path) {
	if (!path || !firebaseConfigured || !fileStorage) return;
	const object = ref(fileStorage, path);
	await deleteObject(object);
}
