'use strict';

const { readWindow, compactMessages, cleanUserText, extractAssistantText, isConversational } = require('../lib/reader');

// Test: reader module exports are functions
console.log('Test: reader exports...');
if (typeof readWindow !== 'function') throw new Error('readWindow not a function');
if (typeof compactMessages !== 'function') throw new Error('compactMessages not a function');
if (typeof cleanUserText !== 'function') throw new Error('cleanUserText not a function');
if (typeof extractAssistantText !== 'function') throw new Error('extractAssistantText not a function');
if (typeof isConversational !== 'function') throw new Error('isConversational not a function');
console.log('  PASS: reader exports are functions');

// Test: compactMessages handles empty input
console.log('Test: compactMessages empty...');
const empty = compactMessages([]);
if (empty.length !== 0) throw new Error('Expected empty array');
console.log('  PASS: empty input returns empty output');

// Test: compactMessages collapses consecutive assistant messages
console.log('Test: compactMessages collapse...');
const messages = [
  { ln: 1, type: 'user', text: 'hello' },
  { ln: 2, type: 'assistant', text: 'hi', requestId: 'a' },
  { ln: 3, type: 'assistant', text: 'more', requestId: 'b' },
  { ln: 4, type: 'assistant', text: 'even more', requestId: 'c' },
];
const compacted = compactMessages(messages);
// Should have: user, first assistant, skip(2)
if (compacted.length !== 3) throw new Error('Expected 3 entries, got ' + compacted.length);
if (compacted[0].type !== 'user') throw new Error('First should be user');
if (compacted[1].type !== 'assistant') throw new Error('Second should be assistant');
if (compacted[2].type !== 'skip') throw new Error('Third should be skip');
if (compacted[2].count !== 2) throw new Error('Skip count should be 2');
console.log('  PASS: consecutive assistant messages collapsed');

// Test: cleanUserText strips system tags
console.log('Test: cleanUserText...');
const cleaned = cleanUserText('hello <system-reminder>stuff</system-reminder> world');
if (cleaned !== 'hello world') throw new Error('Expected tags stripped, got: ' + cleaned);
console.log('  PASS: system tags stripped');

// Test: isConversational filters skill invocations
console.log('Test: isConversational...');
if (isConversational('Start-of-session greeting')) throw new Error('Should filter session greeting');
if (isConversational('[Request interrupted by user]')) throw new Error('Should filter interrupts');
if (!isConversational('Hey can you fix this bug?')) throw new Error('Should keep normal messages');
console.log('  PASS: conversational filtering works');

// Test: archived message filtering by line range (simulates --focus)
console.log('Test: focus range filter...');
const archived = [
  { ln: 10, type: 'user', text: 'early' },
  { ln: 50, type: 'assistant', text: 'mid' },
  { ln: 100, type: 'user', text: 'late' },
];
const focused = archived.filter(m => m.ln >= 40 && m.ln <= 80);
if (focused.length !== 1) throw new Error('Expected 1 message in range');
if (focused[0].ln !== 50) throw new Error('Expected message at line 50');
console.log('  PASS: line range filtering works');

console.log('\nAll archive tests passed.');
