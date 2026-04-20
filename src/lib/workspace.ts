export function looksLikeWorkspacePath(value: string | null | undefined): boolean {
  const text = value?.trim();
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
  const text = value?.trim();
  if (!text) {
    return '本地 / 未分组';
  }

  const normalized = text.replace(/[\\/]+$/, '');
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function workspaceGroupLabel(value: string | null | undefined): string {
  const text = value?.trim();
  if (!text) {
    return '本地 / 未分组';
  }

  if (!looksLikeWorkspacePath(text)) {
    return text;
  }

  return workspaceBaseName(text);
}

export function workspaceTooltip(value: string | null | undefined): string | undefined {
  const text = value?.trim();
  if (!text) {
    return undefined;
  }
  return text;
}
