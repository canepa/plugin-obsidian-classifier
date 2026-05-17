import { App, TFile, requestUrl } from 'obsidian';

export function isRemoteDictionarySource(source: string): boolean {
  return source.startsWith('http://') || source.startsWith('https://');
}

export function parseLegacyDictionaryText(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim().toLowerCase())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .filter((tag, index, self) => self.indexOf(tag) === index);
}

export async function readDictionaryRaw(app: App, source: string): Promise<string> {
  if (isRemoteDictionarySource(source)) {
    const response = await requestUrl({ url: source, method: 'GET' });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.text;
  }

  const file = app.vault.getAbstractFileByPath(source);
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found in vault: ${source}`);
  }

  return app.vault.read(file);
}
