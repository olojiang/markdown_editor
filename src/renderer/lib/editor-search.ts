import { escapeRegExp } from './search';

export interface TextMatchRange {
  end: number;
  start: number;
}

function matchesInText(text: string, query: string): TextMatchRange[] {
  if (!query) return [];
  return [...text.matchAll(new RegExp(escapeRegExp(query), 'gi'))].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

export function countTextMatches(text: string, query: string): number {
  return matchesInText(text, query).length;
}

export function findNextMatch(text: string, query: string, start: number): TextMatchRange | null {
  const matches = matchesInText(text, query);
  return matches.find((match) => match.start >= start) ?? matches[0] ?? null;
}

export function findPreviousMatch(text: string, query: string, start: number): TextMatchRange | null {
  const matches = matchesInText(text, query);
  return matches.filter((match) => match.start < start).at(-1) ?? matches.at(-1) ?? null;
}

export function replaceAllMatches(text: string, query: string, replacement: string): { count: number; value: string } {
  const matches = matchesInText(text, query);
  let value = text;
  for (const match of matches.reverse()) {
    value = `${value.slice(0, match.start)}${replacement}${value.slice(match.end)}`;
  }
  return { count: matches.length, value };
}
