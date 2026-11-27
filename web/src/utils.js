export const MAX_FILE_SIZE = 50 * 1024 * 1024;

const types = {
  jpg: ['photo', 'image/jpeg'], jpeg: ['photo', 'image/jpeg'], png: ['photo', 'image/png'],
  gif: ['photo', 'image/gif'], webp: ['photo', 'image/webp'], bmp: ['photo', 'image/bmp'],
  heic: ['photo', 'image/heic'], heif: ['photo', 'image/heif'],
  mp4: ['video', 'video/mp4'], m4v: ['video', 'video/mp4'], mov: ['video', 'video/quicktime'],
  webm: ['video', 'video/webm'], mp3: ['audio', 'audio/mpeg'], m4a: ['audio', 'audio/mp4'],
  wav: ['audio', 'audio/wav'], aac: ['audio', 'audio/aac'], flac: ['audio', 'audio/flac'],
  ogg: ['audio', 'audio/ogg'], pdf: ['document', 'application/pdf'], txt: ['document', 'text/plain'],
  md: ['document', 'text/plain'], csv: ['document', 'text/csv'], rtf: ['document', 'application/rtf'],
  doc: ['document', 'application/msword'], docx: ['document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xls: ['document', 'application/vnd.ms-excel'], xlsx: ['document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt: ['document', 'application/vnd.ms-powerpoint'], pptx: ['document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
};

export function attachmentType(name) {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const type = types[extension];
  if (!type) throw new Error('Choose a supported photo, video, audio file, or document.');
  return { kind: type[0], contentType: type[1], extension };
}

export function previewKind(name) {
  const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif', 'avif'].includes(extension)) return 'image';
  if (['mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpeg', 'mpg'].includes(extension)) return 'video';
  if (['mp3', 'm4a', 'wav', 'aac', 'flac', 'ogg', 'opus'].includes(extension)) return 'audio';
  if (extension === 'pdf') return 'pdf';
  if (['txt', 'md', 'csv'].includes(extension)) return 'text';
  return null;
}

export function validateFile(file) {
  if (!file || !file.name || file.name.length > 255 || file.name === '.' || file.name === '..' || /[\\/]/.test(file.name))
    throw new Error('Choose a file with a valid name up to 255 characters.');
  if (!file.size || file.size > MAX_FILE_SIZE) throw new Error('Choose a non-empty file no larger than 50 MB.');
}

export function localDateKey(date) {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateTime(date, time) {
  const value = new Date(`${date}T${time}:00`);
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(value.getTime()) || localDateKey(value) !== date || value.getHours() !== hours || value.getMinutes() !== minutes)
    throw new Error('Choose a valid date and time.');
  return value;
}

export function messageTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) && date.getFullYear() >= 1970
    ? date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
    : 'Time unavailable';
}

export function splitLinks(text) {
  const result = [];
  const pattern = /https?:\/\/[^\s<>]+|www\.[^\s<>]+/gi;
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    let raw = match[0];
    while (/[.,!?;:)\]}]$/.test(raw)) raw = raw.slice(0, -1);
    if (!raw) continue;
    const url = raw.toLowerCase().startsWith('www.') ? `https://${raw}` : raw;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
      if (match.index > start) result.push({ text: text.slice(start, match.index) });
      result.push({ text: raw, url: parsed.href });
      start = match.index + raw.length;
    } catch {
      continue;
    }
  }
  if (start < text.length) result.push({ text: text.slice(start) });
  return result;
}
