const DATABASE_NAME = 'recruiter-hub-files';
const STORE_NAME = 'attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
	'application/pdf',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
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

function validateFile(file) {
	const extension = `.${file.name.split('.').pop().toLowerCase()}`;
	if (!ALLOWED_FILE_EXTENSIONS.has(extension)) throw new Error('Choose a PDF, DOC, DOCX, or TXT file.');
	if (file.size > MAX_FILE_SIZE) throw new Error('Attachments must be 10 MB or smaller.');
	if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) throw new Error('This file type is not supported.');
}

async function storeFile(key, file) {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).put(file, key);
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error || new Error('Could not save this attachment in the browser.'));
		transaction.onabort = () => reject(transaction.error || new Error('Attachment storage is full or unavailable.'));
	});
}

async function readFile(key) {
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error('Could not read the saved attachment.'));
	});
}

export async function uploadSharedFile(file) {
	validateFile(file);
	const path = `local:${crypto.randomUUID()}`;
	await storeFile(path, file);
	return path;
}

export async function uploadLegacyAttachment(path, noteId) {
	const file = await readFile(path);
	if (!file) throw new Error(`The locally saved attachment for record ${noteId} is unavailable.`);
	return uploadSharedFile(file);
}

export async function getSharedFileUrl(path) {
	if (/^https?:\/\//i.test(path)) return path;
	if (!path.startsWith('local:')) throw new Error('This attachment is not saved in this browser.');
	const file = await readFile(path);
	if (!file) throw new Error('This attachment is missing from this browser.');
	const url = URL.createObjectURL(file);
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
	return url;
}

export async function deleteSharedFile(path) {
	if (!path?.startsWith('local:')) return;
	const database = await openDatabase();
	return new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, 'readwrite');
		transaction.objectStore(STORE_NAME).delete(path);
		transaction.oncomplete = resolve;
		transaction.onerror = () => reject(transaction.error || new Error('Could not delete the saved attachment.'));
		transaction.onabort = () => reject(transaction.error || new Error('Could not delete the saved attachment.'));
	});
}
