import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	onSnapshot,
	setDoc
} from 'firebase/firestore';
import { database, firebaseConfigured } from './firebase-client.js';
import { uploadLegacyAttachment } from './files.js';

const NOTES_KEY = 'hub.notes';
const SKILLS_KEY = 'hub.skills';
const RECORDS_COLLECTION = 'company_records';
const SETTINGS_COLLECTION = 'hub_settings';
const DEFAULT_SKILLS = 'full-stack engineering, AI/LLM integration, shipping fast';

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
		// Firestore remains the durable source of truth.
	}
}

let notes = readLocalNotes();
let skills = DEFAULT_SKILLS;
let migrationPromise;

export function getNotes() { return notes; }

function notesFromSnapshot(snapshot) {
	return snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
}

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

async function migrateLocalNotes(remoteNotes) {
	if (migrationPromise) return migrationPromise;
	const remoteIds = new Set(remoteNotes.map(note => String(note.id)));
	const localNotes = readLocalNotes().filter(note => !remoteIds.has(String(note.id)));
	if (!localNotes.length) return remoteNotes;

	migrationPromise = (async () => {
		for (const localNote of localNotes) {
			const note = normalizeNote(localNote);
			if (note.attachmentPath && !/^https?:\/\//i.test(note.attachmentPath)) {
				note.attachmentPath = await uploadLegacyAttachment(note.attachmentPath, note.id);
			}
			await setDoc(doc(database, RECORDS_COLLECTION, note.id), note);
			remoteIds.add(note.id);
		}
		return notesFromSnapshot(await getDocs(collection(database, RECORDS_COLLECTION)));
	})();

	try {
		return await migrationPromise;
	} finally {
		migrationPromise = undefined;
	}
}

export async function loadNotes() {
	if (!firebaseConfigured) throw new Error('Configure Firebase to enable shared, real-time records. See README.md.');
	const snapshot = await getDocs(collection(database, RECORDS_COLLECTION));
	notes = await migrateLocalNotes(notesFromSnapshot(snapshot));
	writeLocalNotes(notes);
	return notes;
}

export async function saveNote(note) {
	if (!firebaseConfigured) return false;
	try {
		const updatedNote = normalizeNote(note);
		await setDoc(doc(database, RECORDS_COLLECTION, updatedNote.id), updatedNote);
		const index = notes.findIndex(item => item.id === updatedNote.id);
		notes = index === -1
			? [...notes, updatedNote]
			: notes.map(item => item.id === updatedNote.id ? updatedNote : item);
		writeLocalNotes(notes);
		return true;
	} catch (error) {
		console.error('Could not save the record to Firestore.', error);
		return false;
	}
}

export async function removeNote(id) {
	if (!firebaseConfigured) return false;
	try {
		await deleteDoc(doc(database, RECORDS_COLLECTION, String(id)));
		notes = notes.filter(note => note.id !== id);
		writeLocalNotes(notes);
		return true;
	} catch (error) {
		console.error('Could not delete the record from Firestore.', error);
		return false;
	}
}

export function subscribeToRecordChanges(callback, onError = () => {}) {
	if (!firebaseConfigured) return () => {};
	return onSnapshot(collection(database, RECORDS_COLLECTION), snapshot => {
		notes = notesFromSnapshot(snapshot);
		writeLocalNotes(notes);
		callback();
	}, onError);
}

export function getSkills() { return skills; }

export async function loadSkills() {
	if (!firebaseConfigured) throw new Error('Configure Firebase to sync candidate skills.');
	const settingsRef = doc(database, SETTINGS_COLLECTION, 'candidate');
	const snapshot = await getDoc(settingsRef);
	if (snapshot.exists()) {
		skills = snapshot.data().skills || DEFAULT_SKILLS;
	} else {
		try {
			skills = localStorage.getItem(SKILLS_KEY) || DEFAULT_SKILLS;
		} catch {
			skills = DEFAULT_SKILLS;
		}
		await setDoc(settingsRef, { skills, updatedAt: Date.now() });
	}
	return skills;
}

export async function saveSkills(value) {
	skills = value;
	try {
		localStorage.setItem(SKILLS_KEY, value);
	} catch {
		// Firestore remains the durable source of truth.
	}
	if (!firebaseConfigured) return false;
	try {
		await setDoc(doc(database, SETTINGS_COLLECTION, 'candidate'), { skills: value, updatedAt: Date.now() });
		return true;
	} catch (error) {
		console.error('Could not save candidate skills to Firestore.', error);
		return false;
	}
}

export function subscribeToSkillChanges(callback, onError = () => {}) {
	if (!firebaseConfigured) return () => {};
	return onSnapshot(doc(database, SETTINGS_COLLECTION, 'candidate'), snapshot => {
		if (!snapshot.exists()) return;
		skills = snapshot.data().skills || DEFAULT_SKILLS;
		callback(skills);
	}, onError);
}
