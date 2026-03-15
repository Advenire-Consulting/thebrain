const CONTRACTIONS = {
  "i'm": 'i am', "i'll": 'i will', "i've": 'i have', "i'd": 'i would',
  "we're": 'we are', "we'll": 'we will', "we've": 'we have', "we'd": 'we would',
  "you're": 'you are', "you'll": 'you will', "you've": 'you have', "you'd": 'you would',
  "they're": 'they are', "they'll": 'they will', "they've": 'they have', "they'd": 'they would',
  "he's": 'he is', "she's": 'she is', "it's": 'it is',
  "he'll": 'he will', "she'll": 'she will', "it'll": 'it will',
  "he'd": 'he would', "she'd": 'she would', "it'd": 'it would',
  "that's": 'that is', "there's": 'there is', "here's": 'here is',
  "what's": 'what is', "who's": 'who is', "where's": 'where is',
  "how's": 'how is', "why's": 'why is', "when's": 'when is',
  "wasn't": 'was not', "weren't": 'were not', "isn't": 'is not', "aren't": 'are not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "won't": 'will not', "wouldn't": 'would not', "couldn't": 'could not',
  "shouldn't": 'should not', "can't": 'can not', "cannot": 'can not',
  "hasn't": 'has not', "haven't": 'have not', "hadn't": 'had not',
  "let's": 'let us', "that'll": 'that will', "there'll": 'there will',
};

const CONTRACTION_RE = new RegExp(
  Object.keys(CONTRACTIONS).map(k => k.replace("'", "'?")).join('|'), 'gi'
);

function expandContractions(text) {
  return text.replace(CONTRACTION_RE, m => CONTRACTIONS[m.toLowerCase().replace('\u2019', "'")] || m);
}

function tokenize(text) {
  return expandContractions(text)
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter(t => t.length > 1);
}

const LIGHT_STOPS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'must',
  'am', 'it', 'its', 'he', 'she', 'we', 'they', 'you', 'me', 'him',
  'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'to', 'from',
  'of', 'up', 'out', 'if', 'or', 'and', 'but', 'not', 'no', 'so',
  'as', 'than', 'too', 'very', 'just', 'also', 'into', 'over',
  'after', 'before', 'between', 'under', 'above', 'below',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
  'some', 'such', 'only', 'own', 'same', 'then', 'when', 'where',
  'how', 'why', 'here', 'there', 'now', 'well', 'also', 'back',
]);

const MEDIUM_EXTRA = new Set([
  'certainly', 'let', 'me', 'based', 'looking',
  'using', 'appears', 'seems', 'want', 'going', 'make', 'sure',
  'right', 'okay', 'yes', 'yeah', 'got', 'get', 'see', 'know',
  'think', 'like', 'thing', 'things', 'way', 'take', 'give',
  'still', 'already', 'since', 'actually', 'basically', 'really',
  'probably', 'maybe', 'though', 'however', 'therefore',
  'file', 'files', 'code', 'function', 'error', 'line', 'lines',
  'run', 'running', 'test', 'tests', 'use', 'used', 'data',
  'set', 'new', 'true', 'false', 'null', 'type', 'name', 'value',
  'return', 'const', 'var', 'require', 'module', 'exports',
  'import', 'default', 'class', 'node', 'npm', 'js',
]);

const HEAVY_MIN_LENGTH = 3;

let _dynamicStops = null;

function loadDynamicStops() {
  if (_dynamicStops !== null) return _dynamicStops;
  try {
    const path = require('path');
    const { RecallDB } = require('./db');
    const dbPath = path.join(__dirname, '..', 'recall.db');
    const db = new RecallDB(dbPath);
    db.promoteEligible();
    _dynamicStops = new Set(db.getPromotedStopwords());
    db.close();
  } catch {
    _dynamicStops = new Set();
  }
  return _dynamicStops;
}

function resetDynamicCache() {
  _dynamicStops = null;
}

function filterLight(tokens) {
  return tokens.filter(t => !LIGHT_STOPS.has(t));
}

function filterMedium(tokens) {
  const dynamic = loadDynamicStops();
  return tokens.filter(t => !LIGHT_STOPS.has(t) && !MEDIUM_EXTRA.has(t) && !dynamic.has(t));
}

function filterHeavy(tokens) {
  const dynamic = loadDynamicStops();
  return tokens.filter(t => !LIGHT_STOPS.has(t) && !MEDIUM_EXTRA.has(t) && !dynamic.has(t) && t.length >= HEAVY_MIN_LENGTH);
}

module.exports = { tokenize, expandContractions, filterLight, filterMedium, filterHeavy, resetDynamicCache, LIGHT_STOPS, MEDIUM_EXTRA };
