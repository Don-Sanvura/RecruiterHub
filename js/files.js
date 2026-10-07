import { supabase } from './supabase-client.js';

const BUCKET = 'user-files';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(['application/pdf', 'text/plain']);
const ALLOWED_FILE_EXTENSIONS = new Set(['.pdf', '.txt', '.doc', '.docx']);

function sanitizeFilename(filename) {
  return filename.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'attachment';
}

export async function uploadPrivateFile(file) {
  if (!supabase) throw new Error('Private uploads require the configured Supabase project.');
  const extension = `.${file.name.split('.').pop().toLowerCase()}`;
  if (!ALLOWED_FILE_EXTENSIONS.has(extension)) throw new Error('Choose a PDF, DOC, DOCX, or TXT file.');
  if (file.size > MAX_FILE_SIZE) throw new Error('Attachments must be 10 MB or smaller.');
  if (file.type && !ALLOWED_FILE_TYPES.has(file.type) && !['.doc', '.docx'].includes(extension)) {
    throw new Error('This file type is not supported.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in before uploading an attachment.');

  const path = `${user.id}/${crypto.randomUUID()}-${sanitizeFilename(file.name)}`;
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return data.path;
}

export async function getTemporaryFileUrl(path) {
  if (!supabase) throw new Error('Private downloads require the configured Supabase project.');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function deletePrivateFile(path) {
  if (!supabase || !path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}