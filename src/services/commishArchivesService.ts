import fs from 'fs';
import path from 'path';

export interface CommishQuote {
  id: string;
  quote: string;
  context: string;
  year?: number;
  topic?: string;
  tags?: string[];
}

function getArchiveFilePath(): string {
  try {
    if (typeof process !== 'undefined' && process.cwd && typeof window === 'undefined') {
      return path.join(process.cwd(), 'data', 'commish-archives', 'quotes.json');
    }
  } catch (e) {
    // Ignore in browser
  }
  return '';
}

// Default fallback quotes in case file read fails
const DEFAULT_QUOTES: CommishQuote[] = [
  {
    id: 'quote-001',
    quote: "If you took the points, you're in the wrong pool. Straight up only, baby!",
    context: "1986 Umpire Pool Rulebook",
    year: 1986,
    topic: "straight_up_rules",
    tags: ["rules", "roast", "straight_up"]
  },
  {
    id: 'quote-002',
    quote: "A champion eats steak on Tuesday; the rest of you can split the leftover cold pizza!",
    context: "Tuesday Final Standings Tradition",
    year: 1986,
    topic: "post_game_roast",
    tags: ["roast", "standings", "tuesday"]
  },
  {
    id: 'quote-003',
    quote: "My strike zone wasn't small—your swing was just late. Pick your games on time and don't ask for an extension after kickoff.",
    context: "Crew Chief's Golden Rule",
    year: 1986,
    topic: "pool_heritage",
    tags: ["heritage", "rules", "umpire"]
  }
];

let cachedQuotes: CommishQuote[] | null = null;

export function loadCommishQuotes(): CommishQuote[] {
  try {
    const archiveFile = getArchiveFilePath();
    if (archiveFile && fs && fs.existsSync && fs.existsSync(archiveFile)) {
      const content = fs.readFileSync(archiveFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        cachedQuotes = parsed;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Umpire Archives] Could not read quotes.json, using fallback cache:', err);
  }
  return cachedQuotes || DEFAULT_QUOTES;
}

export function getRandomCommishQuote(tagOrTopic?: string): CommishQuote {
  const allQuotes = loadCommishQuotes();
  let candidateQuotes = allQuotes;

  if (tagOrTopic) {
    const filterTerm = tagOrTopic.toLowerCase();
    const matched = allQuotes.filter(q => 
      (q.topic && q.topic.toLowerCase().includes(filterTerm)) ||
      (q.tags && q.tags.some(t => t.toLowerCase().includes(filterTerm)))
    );
    if (matched.length > 0) {
      candidateQuotes = matched;
    }
  }

  const randomIndex = Math.floor(Math.random() * candidateQuotes.length);
  return candidateQuotes[randomIndex] || allQuotes[0];
}

export function addCommishQuote(newQuote: Omit<CommishQuote, 'id'>): CommishQuote {
  const quotes = loadCommishQuotes();
  const id = `quote-${String(quotes.length + 1).padStart(3, '0')}`;
  const quoteWithId: CommishQuote = { ...newQuote, id };
  quotes.push(quoteWithId);
  cachedQuotes = quotes;

  try {
    const archiveFile = getArchiveFilePath();
    if (archiveFile && fs && path) {
      const dir = path.dirname(archiveFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(archiveFile, JSON.stringify(quotes, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[Umpire Archives] Error saving new quote to disk:', err);
  }

  return quoteWithId;
}
