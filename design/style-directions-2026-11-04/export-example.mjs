// Native export copy and filename helper, isolated without the authenticated controller.
export const EXPORT_COPY=Object.freeze({
  title: 'Export my data',
  lead: 'Download every record of yours as one file.',
  button: 'Download my data',
  working: 'Preparing your file…',
  done: name => `Downloaded ${name}.`,
  off: 'Export is not available yet. Every record is kept.',
  failed: 'Your file could not be prepared. Try again.',
});
export const exportFileName = exportedAt => `guess-the-line-export-${String(exportedAt ?? new Date().toISOString()).slice(0, 10)}.json`;
// Deliberate pattern, not an export timestamp or actual file.
export const EXAMPLE_FILE_PATTERN=exportFileName('YYYY-MM-DD');
