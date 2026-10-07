import { apiRequest, requestBody } from './api.js';
import { deleteSharedFile, uploadLegacyAttachment } from './files.js';

const NOTES_KEY = 'hub.notes';
const SKILLS_KEY = 'hub.skills';
const DEFAULT_SKILLS = 'full-stack engineering, AI/LLM integration, shipping fast';
const SYNC_INTERVAL = 30_000;

function readLocalNotes() {
	try {
		const saved = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
		return Array.isArray(saved) ? saved : [];
	} catch {
		return [];
	}
}

function writeLocalNotes(saved) {
	try {
		localStorage.setItem(NOTES_KEY, JSON.stringify(saved));
	} catch {
		console.warn('Could not cache shared company records in this browser.');
	}
}

function writeLocalSkills(value) {
	try {
		localStorage.setItem(SKILLS_KEY, value);
	} catch {
		console.warn('Could not cache candidate skills in this browser.');
	}
}

let notes = readLocalNotes();
let skills = DEFAULT_SKILLS;
let migrationPromise;
let lastStorageError = '';

export function getNotes() { return notes; }
export function getLastStorageError() { return lastStorageError; }

function normalizeNote(note) {
	return {
		id: String(note.id),
		company: String(note.company || ''),
		site: note.site || '',
		offer: note.offer || '',
		job: note.job || '',
		notes: note.notes || '',
		status: note.status || 'Researching',
		source: note.source === 'recruiter-re-audit' ? note.source : 'info-hub',
		recruiterName: note.recruiterName || '',
		referralName: note.referralName || '',
		referralEmail: note.referralEmail || '',
		referralContext: note.referralContext || '',
		attachmentPath: note.attachmentPath || '',
		submittedAt: note.submittedAt || null,
		updatedAt: Date.now()
	};
}

function applyServerData(data) {
	notes = data.notes;
	skills = data.skills || DEFAULT_SKILLS;
	writeLocalNotes(notes);
	writeLocalSkills(skills);
}

async function migrateLocalNotes(remoteNotes, cachedNotes) {
	if (migrationPromise) return migrationPromise;
	const remoteIds = new Set(remoteNotes.map(note => String(note.id)));
	const localNotes = cachedNotes.filter(note => !remoteIds.has(String(note.id)));
	if (!localNotes.length) return remoteNotes;

	migrationPromise = (async () => {
		for (const localNote of localNotes) {
			const note = normalizeNote(localNote);
			let uploadedAttachment = '';
			if (note.attachmentPath && !/^https?:\/\//i.test(note.attachmentPath) && !note.attachmentPath.startsWith('github:')) {
				note.attachmentPath = await uploadLegacyAttachment(note.attachmentPath, note.id);
				uploadedAttachment = note.attachmentPath;
			}
			if (!await saveNote(note)) {
				if (uploadedAttachment) {
					try {
						await deleteSharedFile(uploadedAttachment);
					} catch (error) {
						console.error('Could not remove an attachment after its record migration failed.', error);
					}
				}
				throw new Error(lastStorageError || `Could not migrate the saved record for ${note.company}.`);
			}
		}
		return notes;
	})();
	try {
		return await migrationPromise;
	} finally {
		migrationPromise = undefined;
	}
}

export async function loadNotes() {
	const cachedNotes = readLocalNotes();
	const data = await apiRequest('/api/data');
	applyServerData(data);
	await migrateLocalNotes(data.notes, cachedNotes);
	return notes;
}

export async function saveNote(note) {
	try {
		const data = await apiRequest('/api/data', {
			method: 'POST',
			body: requestBody({ action: 'saveNote', note: normalizeNote(note) })
		});
		applyServerData(data);
		lastStorageError = '';
		return true;
	} catch (error) {
		lastStorageError = error.message;
		console.error('Could not save the record to the GitHub repository.', error);
		return false;
	}
}

export async function removeNote(id) {
	try {
		const data = await apiRequest(`/api/data?id=${encodeURIComponent(String(id))}`, { method: 'DELETE' });
		applyServerData(data);
		lastStorageError = '';
		return true;
	} catch (error) {
		lastStorageError = error.message;
		console.error('Could not delete the record from the GitHub repository.', error);
		return false;
	}
}

function subscribeToData(callback, onError) {
	let stopped = false;
	let inFlight = false;
	let previousNotes = JSON.stringify(notes);
	let previousSkills = skills;
	const sync = async () => {
		if (stopped || inFlight) return;
		inFlight = true;
		try {
			const data = await apiRequest('/api/data');
			if (stopped) return;
			applyServerData(data);
			const changed = previousNotes !== JSON.stringify(notes) || previousSkills !== skills;
			previousNotes = JSON.stringify(notes);
			previousSkills = skills;
			if (changed) callback(data);
		} catch (error) {
			if (!stopped) onError(error);
		} finally {
			inFlight = false;
		}
	};
	const timer = setInterval(() => { void sync(); }, SYNC_INTERVAL);
	return () => {
		stopped = true;
		clearInterval(timer);
	};
}

export function subscribeToRecordChanges(callback, onError = () => {}) {
	return subscribeToData(callback, onError);
}

export function getSkills() { return skills; }

export async function loadSkills() {
	const data = await apiRequest('/api/data');
	applyServerData(data);
	return skills;
}

export async function saveSkills(value) {
	try {
		const data = await apiRequest('/api/data', {
			method: 'POST',
			body: requestBody({ action: 'saveSkills', skills: value })
		});
		applyServerData(data);
		lastStorageError = '';
		return true;
	} catch (error) {
		lastStorageError = error.message;
		console.error('Could not save candidate skills to the GitHub repository.', error);
		return false;
	}
}

export function subscribeToSkillChanges(callback, onError = () => {}) {
	return subscribeToData(data => callback(data.skills), onError);
}
