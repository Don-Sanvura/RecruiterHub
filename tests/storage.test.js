import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalLocalStorage = globalThis.localStorage;
const originalWindow = globalThis.window;

function createStorage() {
	const values = new Map();
	return {
		getItem(key) { return values.get(key) ?? null; },
		setItem(key, value) { values.set(key, String(value)); },
		removeItem(key) { values.delete(key); },
		values
	};
}

test('records and skills stay local and storage events sync open browser tabs', async () => {
	const localStorage = createStorage();
	let failSkillsWrite = false;
	const setItem = localStorage.setItem;
	localStorage.setItem = (key, value) => {
		if (failSkillsWrite && key === 'hub.skills') throw new Error('quota exceeded');
		setItem.call(localStorage, key, value);
	};
	const listeners = new Map();
	globalThis.localStorage = localStorage;
	globalThis.window = {
		addEventListener(name, callback) {
			if (!listeners.has(name)) listeners.set(name, new Set());
			listeners.get(name).add(callback);
		}
	};

	try {
		const { getNotes, getSkills, removeNote, saveNote, saveSkills, subscribeToRecordChanges, subscribeToSkillChanges } =
			await import('../js/storage.js?static-storage-test');
		let recordUpdates = 0;
		let skillsUpdate = '';
		const stopRecords = subscribeToRecordChanges(() => { recordUpdates += 1; });
		const stopSkills = subscribeToSkillChanges(value => { skillsUpdate = value; });

		assert.equal(await saveNote({ id: 'local-1', company: 'Local Company' }), true);
		assert.equal(getNotes()[0].company, 'Local Company');
		assert.equal(recordUpdates, 0);
		assert.deepEqual(JSON.parse(localStorage.getItem('hub.notes')).map(note => note.id), ['local-1']);

		assert.equal(await saveSkills('JavaScript, CSS'), true);
		assert.equal(getSkills(), 'JavaScript, CSS');
		assert.equal(skillsUpdate, 'JavaScript, CSS');
		assert.equal(localStorage.getItem('hub.skills'), 'JavaScript, CSS');

		localStorage.setItem('hub.notes', JSON.stringify([{ id: 'other-tab', company: 'Other Tab Co' }]));
		for (const callback of listeners.get('storage')) callback({ key: 'hub.notes' });
		assert.equal(getNotes()[0].company, 'Other Tab Co');
		assert.equal(recordUpdates, 1);

		assert.equal(await removeNote('other-tab'), true);
		assert.deepEqual(getNotes(), []);
		failSkillsWrite = true;
		const previousNotesJson = localStorage.getItem('hub.notes');
		const originalConsoleError = console.error;
		let saved;
		try {
			console.error = () => {};
			saved = await saveNote({ id: 'quota-fail', company: 'Not Saved' });
		} finally {
			console.error = originalConsoleError;
		}
		assert.equal(saved, false);
		assert.deepEqual(getNotes(), []);
		assert.equal(localStorage.getItem('hub.notes'), previousNotesJson);
		stopRecords();
		stopSkills();
	} finally {
		if (originalLocalStorage === undefined) delete globalThis.localStorage;
		else globalThis.localStorage = originalLocalStorage;
		if (originalWindow === undefined) delete globalThis.window;
		else globalThis.window = originalWindow;
	}
});
