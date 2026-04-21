const UNGROUPED_LABEL = '本地对话';

export function normalizeWorkspaceValue(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) {
    return '';
  }

  if (text.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${text.slice('\\\\?\\UNC\\'.length)}`;
  }

  if (text.startsWith('\\\\?\\')) {
    return text.slice('\\\\?\\'.length);
  }

  return text;
}

export function looksLikeWorkspacePath(value: string | null | undefined): boolean {
  const text = normalizeWorkspaceValue(value);
  if (!text) {
    return false;
  }

  return (
    /^[a-zA-Z]:[\\/]/.test(text) ||
    text.startsWith('\\\\') ||
    text.startsWith('/') ||
    text.startsWith('./') ||
    text.startsWith('../')
  );
}

export function workspaceBaseName(value: string | null | undefined): string {
  const text = normalizeWorkspaceValue(value);
  if (!text) {
    return UNGROUPED_LABEL;
  }

  const normalized = text.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function workspaceGroupLabel(value: string | null | undefined): string {
  const text = normalizeWorkspaceValue(value);
  if (!text) {
    return UNGROUPED_LABEL;
  }

  if (!looksLikeWorkspacePath(text)) {
    return text;
  }

  return workspaceBaseName(text);
}

export function workspaceTooltip(value: string | null | undefined): string | undefined {
  const text = normalizeWorkspaceValue(value);
  return text || undefined;
}

export function ungroupedWorkspaceLabel(): string {
  return UNGROUPED_LABEL;
}
