#!/usr/bin/env node

/**
 * update-leaderboard.js
 * 
 * Parses a score payload from repository_dispatch,
 * updates README.md leaderboard table between markers,
 * and writes the updated file.
 * 
 * Usage: node scripts/update-leaderboard.js '{"playerName":"yamac","score":1500}'
 */

const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 100;
const README_PATH = path.join(__dirname, '..', 'README.md');
const START_MARKER = '<!-- LEADERBOARD_START -->';
const END_MARKER = '<!-- LEADERBOARD_END -->';

// Rank emojis for top 3
const RANK_EMOJIS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function parsePayload() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('No payload provided');
    process.exit(1);
  }

  try {
    const payload = JSON.parse(raw);
    const { playerName, score, date } = payload;

    if (!playerName || typeof score !== 'number' || score <= 0) {
      console.error('Invalid payload:', payload);
      process.exit(1);
    }

    // Sanitize player name (alphanumeric, spaces, underscores, dashes, max 20 chars)
    const sanitizedName = playerName
      .replace(/[^a-zA-Z0-9\s_\-\.]/g, '')
      .slice(0, 20)
      .trim();

    if (!sanitizedName) {
      console.error('Player name is empty after sanitization');
      process.exit(1);
    }

    // Cap score at reasonable max (prevent absurd fake scores)
    const cappedScore = Math.min(Math.floor(score), 999999);

    return {
      playerName: sanitizedName,
      score: cappedScore,
      date: date || new Date().toISOString().split('T')[0],
    };
  } catch (err) {
    console.error('Failed to parse payload:', err.message);
    process.exit(1);
  }
}

function parseExistingScores(readme) {
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    console.error('Markers not found in README.md');
    process.exit(1);
  }

  const tableContent = readme.slice(startIdx + START_MARKER.length, endIdx);
  const lines = tableContent.trim().split('\n');

  const scores = [];

  for (const line of lines) {
    // Skip header row, separator row, and empty/placeholder rows
    if (!line.startsWith('|')) continue;

    const cells = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cells.length < 4) continue;

    // Skip header row
    if (cells[0] === 'Rank' || cells[0].includes('---')) continue;

    // Skip placeholder rows
    if (cells[1] === '-' || cells[1] === '*No scores yet*') continue;

    // Parse rank (remove emoji prefix)
    const playerName = cells[1];
    const score = parseInt(cells[2].replace(/,/g, ''), 10);
    const date = cells[3];

    if (isNaN(score)) continue;

    scores.push({ playerName, score, date });
  }

  return scores;
}

function buildTable(scores) {
  const header = '| Rank | Player | Score | Date |\n|------|--------|-------|------|';

  if (scores.length === 0) {
    return `${header}\n| - | *No scores yet* | - | - |`;
  }

  const rows = scores.map((entry, i) => {
    const rank = i + 1;
    const emoji = RANK_EMOJIS[rank] || '';
    const rankStr = emoji ? `${emoji} ${rank}` : `${rank}`;
    const scoreStr = entry.score.toLocaleString('en-US');
    return `| ${rankStr} | ${entry.playerName} | ${scoreStr} | ${entry.date} |`;
  });

  return `${header}\n${rows.join('\n')}`;
}

function updateMetadata(readme, totalGames) {
  const now = new Date().toISOString().replace('T', ' ').split('.')[0] + ' UTC';

  readme = readme.replace(
    /📊 \*\*Total games played:\*\* \d+/,
    `📊 **Total games played:** ${totalGames}`
  );

  readme = readme.replace(
    /🕐 \*\*Last updated:\*\* .*/,
    `🕐 **Last updated:** ${now}`
  );

  return readme;
}

function main() {
  const newEntry = parsePayload();
  console.log(`Processing score: ${newEntry.playerName} = ${newEntry.score}`);

  let readme = fs.readFileSync(README_PATH, 'utf-8');
  const existingScores = parseExistingScores(readme);

  // Add new score
  existingScores.push(newEntry);

  // Sort by score (descending), then by date (newest first for ties)
  existingScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.date.localeCompare(a.date);
  });

  // Trim to max entries
  const trimmed = existingScores.slice(0, MAX_ENTRIES);

  // Build new table
  const newTable = buildTable(trimmed);

  // Replace between markers
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);

  readme = readme.slice(0, startIdx + START_MARKER.length) +
    '\n' + newTable + '\n' +
    readme.slice(endIdx);

  // Extract total games from existing readme
  const totalMatch = readme.match(/Total games played:\*\* (\d+)/);
  const currentTotal = totalMatch ? parseInt(totalMatch[1], 10) : 0;
  readme = updateMetadata(readme, currentTotal + 1);

  fs.writeFileSync(README_PATH, readme, 'utf-8');
  console.log(`Leaderboard updated. ${trimmed.length} entries, total games: ${currentTotal + 1}`);
}

main();
