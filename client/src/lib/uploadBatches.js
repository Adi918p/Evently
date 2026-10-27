export function partitionUploads(files) {
  const batches = []; let current = []; let bytes = 0; let encoded = 0;
  for (const file of files) {
    const size = Number(file.bytes);
    const wireSize = JSON.stringify({ type: file.type, data: file.data }).length + 1;
    if (!Number.isFinite(size) || size <= 0 || size > 4 * 1024 * 1024) throw new Error('Each image must be at most 4 MB.');
    if (current.length && (current.length >= 8 || bytes + size > 8 * 1024 * 1024 || encoded + wireSize > 11 * 1024 * 1024)) {
      batches.push(current); current = []; bytes = 0; encoded = 0;
    }
    current.push(file); bytes += size; encoded += wireSize;
  }
  if (current.length) batches.push(current);
  return batches;
}
