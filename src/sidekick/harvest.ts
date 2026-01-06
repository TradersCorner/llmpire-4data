import { load, CheerioAPI, Element } from 'cheerio';
import { createHash } from 'crypto';

export interface NumericField {
  cssPath: string;
  anchor: string;
  value: number;
  raw: string;
  index: number;
}

export interface FieldDelta {
  fieldKey: string;
  anchor: string;
  prev: number | null | undefined;
  curr: number | null | undefined;
  delta: number | null;
  raw: string;
}

export interface SurfaceSnapshot {
  fingerprint: string;
  fields: Map<string, number | null>;
  rawFields: Map<string, { anchor: string; raw: string }>;
}

const PARSER_VERSION = 'v1';

export function computeFingerprint(url: string, contentType: string | null): string {
  const h = createHash('sha256');
  h.update(url + '|' + (contentType ?? 'unknown') + '|' + PARSER_VERSION);
  return h.digest('hex');
}

export function computeFieldKey(cssPath: string, anchor: string, index: number): string {
  const h = createHash('sha256');
  h.update(cssPath + '|' + anchor + '|' + String(index));
  return h.digest('hex');
}

function getCssPath($: CheerioAPI, el: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current.tagName !== 'html') {
    const tag = current.tagName.toLowerCase();
    const parent = current.parent as Element | undefined;
    let index = 0;
    if (parent && (parent as any).children) {
      const siblings = (parent as any).children.filter((c: any) => c.type === 'tag' && c.tagName === current!.tagName);
      index = siblings.indexOf(current);
    }
    const part = index >= 0 ? `${tag}:nth-of-type(${index + 1})` : tag;
    parts.unshift(part);
    current = parent ?? null;
  }

  return parts.join(' > ');
}

function extractNumericFromText(text: string): { raw: string; value: number }[] {
  const results: { raw: string; value: number }[] = [];
  const regex = /-?\d[\d,]*(?:\.\d+)?/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = raw.replace(/,/g, '');
    const value = parseFloat(cleaned);
    if (!Number.isNaN(value)) {
      results.push({ raw, value });
    }
  }

  return results;
}

export function extractNumericFields(html: string): NumericField[] {
  const $ = load(html);
  const fields: NumericField[] = [];

  $('body *').each((_, elem) => {
    const el = elem as Element;
    if (['script', 'style', 'noscript', 'svg'].includes(el.tagName?.toLowerCase?.() ?? '')) return;

    const text = $(el).text();
    if (!/\d/.test(text)) return;

    const nums = extractNumericFromText(text);
    if (nums.length === 0) return;

    const cssPath = getCssPath($, el);
    const anchorText = $(el).clone().children().remove().end().text().trim().replace(/\s+/g, ' ');
    const anchor = anchorText.slice(0, 120);

    nums.forEach((n, index) => {
      fields.push({
        cssPath,
        anchor,
        value: n.value,
        raw: n.raw,
        index
      });
    });
  });

  return fields;
}

export function buildSnapshot(url: string, contentType: string | null, html: string): SurfaceSnapshot {
  const fields = extractNumericFields(html);
  const fingerprint = computeFingerprint(url, contentType);

  const fieldMap = new Map<string, number | null>();
  const rawMap = new Map<string, { anchor: string; raw: string }>();

  for (const f of fields) {
    const key = computeFieldKey(f.cssPath, f.anchor, f.index);
    fieldMap.set(key, f.value);
    rawMap.set(key, { anchor: f.anchor, raw: f.raw });
  }

  return { fingerprint, fields: fieldMap, rawFields: rawMap };
}

export function diffSnapshots(prev: SurfaceSnapshot | null, curr: SurfaceSnapshot): FieldDelta[] {
  const deltas: FieldDelta[] = [];

  const keys = new Set<string>([...curr.fields.keys(), ...(prev?.fields.keys() ?? [])]);

  for (const key of keys) {
    const prevVal = prev?.fields.get(key);
    const currVal = curr.fields.get(key);

    if (prevVal === undefined && currVal === undefined) continue;

    const rawMeta = curr.rawFields.get(key) ?? prev?.rawFields.get(key) ?? { anchor: '', raw: '' };

    // Field disappeared
    if (typeof prevVal === 'number' && currVal === undefined) {
      deltas.push({
        fieldKey: key,
        anchor: rawMeta.anchor,
        prev: prevVal,
        curr: null,
        delta: null,
        raw: rawMeta.raw
      });
      continue;
    }

    // Field appeared
    if (prevVal === undefined && typeof currVal === 'number') {
      deltas.push({
        fieldKey: key,
        anchor: rawMeta.anchor,
        prev: undefined,
        curr: currVal,
        delta: null,
        raw: rawMeta.raw
      });
      continue;
    }

    if (typeof prevVal === 'number' && typeof currVal === 'number' && prevVal !== currVal) {
      const delta = currVal - prevVal;
      deltas.push({
        fieldKey: key,
        anchor: rawMeta.anchor,
        prev: prevVal,
        curr: currVal,
        delta,
        raw: rawMeta.raw
      });
    }
  }

  return deltas;
}
