import { createClient } from '@supabase/supabase-js';
import { attachmentType, validateFile } from './utils.js';

const supabase = createClient(
  'https://pibgazoibrdhwnotdazd.supabase.co',
  'sb_publishable_JLSX4s9PMX1fDjh_XDLNrQ_Bg9LIsWH'
);

function checked({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export const auth = {
  session: async () => checked(await supabase.auth.getSession()).session,
  signIn: async (email, password) => checked(await supabase.auth.signInWithPassword({ email, password })),
  signUp: async (email, password, name) => checked(await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })),
  signOut: async () => checked(await supabase.auth.signOut())
};

export async function membership(userId) {
  return checked(await supabase.from('band_members').select('band_id,role').eq('user_id', userId).limit(1).maybeSingle());
}

export async function requestAccess(userId, retry = false) {
  checked(await supabase.rpc('request_band_access', { p_retry: retry }));
  return checked(await supabase.from('band_access_requests').select('status').eq('user_id', userId).maybeSingle());
}

export async function requests(bandId) {
  return checked(await supabase.from('band_access_requests').select('user_id,display_name,email').eq('band_id', bandId).eq('status', 'pending').order('requested_at'));
}

export async function reviewRequest(userId, approve) {
  checked(await supabase.rpc('review_band_access', { p_user_id: userId, p_approve: approve }));
}

export async function profiles() {
  return checked(await supabase.from('band_profiles').select('user_id,display_name'));
}

export async function messages(bandId) {
  const rows = checked(await supabase.from('band_messages')
    .select('id,sender_id,sender_email,body,created_at,is_pinned,image_path,attachment_name,attachment_kind')
    .eq('band_id', bandId).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(100));
  return rows.reverse();
}

async function removeObject(bucket, path) {
  checked(await supabase.storage.from(bucket).remove([path]));
}

async function insertWithCleanup(table, column, record, bucket, path) {
  const result = await supabase.from(table).insert(record);
  if (!result.error) return;
  let existing;
  try {
    existing = checked(await supabase.from(table).select(column).eq(column, path).limit(1).maybeSingle());
  } catch (error) {
    throw new Error(`The upload could not be confirmed. Check before trying again: ${error.message}`);
  }
  if (existing) throw new Error('The upload may have succeeded. Check before trying again.');
  try {
    await removeObject(bucket, path);
  } catch (error) {
    throw new Error(`Saving failed and the uploaded copy could not be removed: ${error.message}`);
  }
  throw new Error(`Saving failed; the uploaded copy was removed: ${result.error.message}`);
}

export async function sendMessage(user, bandId, text, file) {
  const body = text.trim();
  if (body.length > 4000) throw new Error('Messages must be 4000 characters or fewer.');
  if (!file) {
    if (!body) throw new Error('Enter a message or choose a file.');
    checked(await supabase.from('band_messages').insert({ band_id: bandId, sender_id: user.id, sender_email: user.email || 'Band member', body }));
    return;
  }
  validateFile(file);
  const type = attachmentType(file.name);
  const path = `${bandId}/${user.id}/${crypto.randomUUID().replaceAll('-', '')}.${type.extension}`;
  checked(await supabase.storage.from('chat-photos').upload(path, file, { contentType: type.contentType }));
  await insertWithCleanup('band_messages', 'image_path', {
    band_id: bandId, sender_id: user.id, sender_email: user.email || 'Band member',
    body: body || (type.kind === 'photo' ? 'Photo' : 'Attachment'),
    image_path: path, attachment_name: file.name, attachment_kind: type.kind
  }, 'chat-photos', path);
}

export async function pinMessage(id, pinned) {
  checked(await supabase.rpc('set_band_message_pinned', { p_message_id: id, p_is_pinned: pinned }));
}

export async function deleteMessage(message, userId, bandId) {
  if (message.image_path) {
    checked(await supabase.rpc('finalize_chat_photo_delete', { p_message_id: message.id, p_check_only: true }));
    await removeObject('chat-photos', message.image_path);
    checked(await supabase.rpc('finalize_chat_photo_delete', { p_message_id: message.id, p_check_only: false }));
  } else {
    const rows = checked(await supabase.from('band_messages').delete().eq('id', message.id).eq('band_id', bandId).eq('sender_id', userId).select('id'));
    if (rows.length !== 1) throw new Error('The message was not deleted; it may no longer exist.');
  }
}

export async function events(bandId) {
  return checked(await supabase.from('band_events').select('id,title,starts_at,location,event_type')
    .eq('band_id', bandId).eq('event_type', 'event').order('starts_at').limit(1000));
}

export async function addEvent(bandId, title, startsAt, location) {
  checked(await supabase.from('band_events').insert({
    band_id: bandId, title: title.trim(), starts_at: startsAt.toISOString(),
    location: location.trim(), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', event_type: 'event'
  }));
}

export async function files(bandId, category) {
  return checked(await supabase.from('band_files').select('id,storage_path,file_name,category,created_at')
    .eq('band_id', bandId).eq('category', category).order('created_at', { ascending: false }).limit(200));
}

export async function uploadFile(user, bandId, category, file) {
  validateFile(file);
  const path = `${bandId}/${user.id}/${crypto.randomUUID().replaceAll('-', '')}/${file.name}`;
  checked(await supabase.storage.from('band-files').upload(path, file, { contentType: file.type || 'application/octet-stream' }));
  await insertWithCleanup('band_files', 'storage_path', {
    band_id: bandId, storage_path: path, file_name: file.name, category, uploaded_by: user.id
  }, 'band-files', path);
}

export async function deleteFile(file) {
  checked(await supabase.rpc('finalize_band_file_delete', { p_file_id: file.id, p_check_only: true }));
  await removeObject('band-files', file.storage_path);
  checked(await supabase.rpc('finalize_band_file_delete', { p_file_id: file.id, p_check_only: false }));
}

export async function signedUrl(bucket, path, download = false) {
  const data = checked(await supabase.storage.from(bucket).createSignedUrl(path, 3600, download ? { download } : undefined));
  const url = new URL(data.signedUrl);
  if (url.protocol !== 'https:' || url.hostname !== 'pibgazoibrdhwnotdazd.supabase.co'
    || !url.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`))
    throw new Error('The file link returned by the server is invalid.');
  return url.href;
}
