import { isLocalDemo, supabase } from './supabase-client.js';

const KEYS = { notes: 'hub.notes', skills: 'hub.skills' };
function read(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
let notes = isLocalDemo ? read(KEYS.notes, []) : [];

function fromRecord(record) {
	return {
		id: record.id,
		company: record.company,
		site: record.site,
		offer: record.offer,
		job: record.job,
		notes: record.notes,
		status: record.status,
		source: record.source,
		recruiterName: record.recruiter_name,
		referralName: record.referral_name,
		referralEmail: record.referral_email,
		referralContext: record.referral_context,
		attachmentPath: record.attachment_path,
		submittedAt: record.submitted_at
	};
}

function toRecord(note, userId) {
	return {
		id: String(note.id),
		company: note.company,
		site: note.site || '',
		offer: note.offer || '',
		job: note.job || '',
		notes: note.notes || '',
		status: note.status || 'Researching',
		source: note.source || 'info-hub',
		recruiter_name: note.recruiterName || '',
		referral_name: note.referralName || '',
		referral_email: note.referralEmail || '',
		referral_context: note.referralContext || '',
		attachment_path: note.attachmentPath || '',
		submitted_at: note.submittedAt || null,
		created_by: userId,
		updated_at: new Date().toISOString()
	};
}

export function getNotes() { return notes; }

export async function loadNotes() {
	if (isLocalDemo) {
		notes = read(KEYS.notes, []);
		return notes;
	}
	if (!supabase) throw new Error('Database is not configured.');
	const { data, error } = await supabase.from('company_records').select('*').order('updated_at', { ascending: false });
	if (error) throw error;
	notes = data.map(fromRecord);
	return notes;
}

export async function refreshNotes() {
	return loadNotes();
}

export async function saveNote(note) {
	if (isLocalDemo) {
		const index = notes.findIndex(item => item.id === note.id);
		notes = index === -1 ? [...notes, note] : notes.map(item => item.id === note.id ? { ...item, ...note } : item);
		return write(KEYS.notes, notes);
	}
	if (!supabase) return false;
	const { data: { session } } = await supabase.auth.getSession();
	if (!session?.user) return false;
	const record = toRecord(note, session.user.id);
	const request = note.source === 'recruiter-re-audit'
		? supabase.from('company_records').insert(record)
		: supabase.from('company_records').upsert(record);
	const { error } = await request;
	if (error) return false;
	if (note.source !== 'recruiter-re-audit') {
		const index = notes.findIndex(item => item.id === note.id);
		notes = index === -1 ? [...notes, note] : notes.map(item => item.id === note.id ? { ...item, ...note } : item);
	}
	return true;
}

export async function removeNote(id) {
	if (isLocalDemo) {
		notes = notes.filter(note => note.id !== id);
		return write(KEYS.notes, notes);
	}
	if (!supabase) return false;
	const { error } = await supabase.from('company_records').delete().eq('id', id);
	if (error) return false;
	notes = notes.filter(note => note.id !== id);
	return true;
}

export function clearNotes() { notes = []; }

export function subscribeToRecordChanges(callback) {
	if (!supabase || isLocalDemo) return () => {};
	const channel = supabase.channel('company-records-live')
		.on('postgres_changes', { event: '*', schema: 'public', table: 'company_records' }, callback)
		.subscribe();
	return () => supabase.removeChannel(channel);
}

export function getSkills() { return read(KEYS.skills, 'full-stack engineering, AI/LLM integration, shipping fast'); }
export function saveSkills(skills) { return write(KEYS.skills, skills); }