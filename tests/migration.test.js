import assert from 'node:assert/strict';
import { test } from 'node:test';

const originalFetch = globalThis.fetch;

test('cached records are preserved and migrated before the cache is refreshed', async () => {
	const cache = new Map([['hub.notes', JSON.stringify([{
		id: 'legacy-1',
		company: 'Legacy Company',
		status: 'Researching'
	}])]]);
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		value: {
			getItem(key) { return cache.get(key) ?? null; },
			setItem(key, value) { cache.set(key, value); }
		}
	});
	const savedRequests = [];
	globalThis.fetch = async (url, options = {}) => {
		if (options.method === 'POST') {
			const body = JSON.parse(options.body);
			savedRequests.push(body.note);
			return Response.json({
				notes: [body.note],
				skills: 'full-stack engineering, AI/LLM integration, shipping fast'
			});
		}
		return Response.json({
			notes: [],
			skills: 'full-stack engineering, AI/LLM integration, shipping fast'
		});
	};

	try {
		const { loadNotes } = await import('../js/storage.js?migration-test');
		const notes = await loadNotes();
		assert.equal(savedRequests.length, 1);
		assert.equal(savedRequests[0].company, 'Legacy Company');
		assert.equal(notes[0].id, 'legacy-1');
	} finally {
		globalThis.fetch = originalFetch;
		delete globalThis.localStorage;
	}
});
