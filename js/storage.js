const NOTES_KEY = 'hub.notes';
const SKILLS_KEY = 'hub.skills';
const DEFAULT_SKILLS = 'full-stack engineering, AI/LLM integration, shipping fast';

function readJson(key, fallback) {
	try {
		const value = JSON.parse(localStorage.getItem(key) || 'null');
		return value ?? fallback;
	} catch {
		return fallback;
	}
}

let notes = readJson(NOTES_KEY, []);
if (!Array.isArray(notes)) notes = [];
let skills = DEFAULT_SKILLS;
try {
	skills = localStorage.getItem(SKILLS_KEY) || DEFAULT_SKILLS;
} catch {
	// Storage errors are surfaced when a save is attempted.
}
let lastStorageError = '';

export function getNotes() { return notes; }
export function getLastStorageError() { return lastStorageError; }
export function getSkills() { return skills; }

function persist() {
	let previousNotes;
	let previousSkills;
	try {
		previousNotes = localStorage.getItem(NOTES_KEY);
		previousSkills = localStorage.getItem(SKILLS_KEY);
		localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
		localStorage.setItem(SKILLS_KEY, skills);
		lastStorageError = '';
		return true;
	} catch (error) {
		try {
			if (previousNotes === null) localStorage.removeItem(NOTES_KEY);
			else if (previousNotes !== undefined) localStorage.setItem(NOTES_KEY, previousNotes);
			if (previousSkills === null) localStorage.removeItem(SKILLS_KEY);
			else if (previousSkills !== undefined) localStorage.setItem(SKILLS_KEY, previousSkills);
		} catch (restoreError) {
			console.error('Could not restore browser data after a failed save.', restoreError);
		}
		lastStorageError = `Could not save data in this browser: ${error.message}`;
		console.error(lastStorageError, error);
		return false;
	}
}

export async function loadNotes() {
	return notes;
}

export async function saveNote(note) {
	const updatedNote = {
		...note,
		id: String(note.id),
		company: String(note.company || '').trim(),
		updatedAt: Date.now()
	};
	const index = notes.findIndex(item => String(item.id) === updatedNote.id);
	const previousNotes = notes;
	notes = index < 0
		? [...notes, updatedNote]
		: notes.map((item, itemIndex) => itemIndex === index ? updatedNote : item);
	if (persist()) return true;
	notes = previousNotes;
	return false;
}

export async function removeNote(id) {
	const previousNotes = notes;
	notes = notes.filter(note => String(note.id) !== String(id));
	if (persist()) return true;
	notes = previousNotes;
	return false;
}

function notifySubscribers() {
	const data = { notes, skills };
	for (const callback of recordSubscribers) callback(data);
	for (const callback of skillSubscribers) callback(skills);
}

const recordSubscribers = new Set();
const skillSubscribers = new Set();

window.addEventListener('storage', event => {
	if (event.key === NOTES_KEY || event.key === SKILLS_KEY) {
		notes = readJson(NOTES_KEY, []);
		if (!Array.isArray(notes)) notes = [];
		try {
			skills = localStorage.getItem(SKILLS_KEY) || DEFAULT_SKILLS;
		} catch {
			skills = DEFAULT_SKILLS;
		}
		notifySubscribers();
	}
});

export function subscribeToRecordChanges(callback) {
	recordSubscribers.add(callback);
	return () => recordSubscribers.delete(callback);
}

export async function loadSkills() {
	return skills;
}

export async function saveSkills(value) {
	const previousSkills = skills;
	skills = String(value);
	if (!persist()) {
		skills = previousSkills;
		return false;
	}
	for (const callback of skillSubscribers) callback(skills);
	return true;
}

export function subscribeToSkillChanges(callback) {
	skillSubscribers.add(callback);
	return () => skillSubscribers.delete(callback);
}
