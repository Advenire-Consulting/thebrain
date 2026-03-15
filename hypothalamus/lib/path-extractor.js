'use strict';

const path = require('path');
const os = require('os');

const FS_COMMANDS = new Set([
  'rm', 'rmdir', 'mv', 'cp', 'ln', 'chmod', 'chown', 'touch', 'mkdir',
  'cat', 'less', 'more', 'head', 'tail', 'nano', 'vim', 'vi', 'code',
  'sqlite3', 'tar', 'zip', 'unzip', 'gzip', 'gunzip',
]);

const GIT_PATH_COMMANDS = new Set(['checkout', 'restore', 'rm', 'add']);

const UNPARSEABLE_PATTERNS = [
  /\$\(/,
  /`[^`]+`/,
  /\$\{/,
  /\$[A-Z_][A-Z0-9_]*/,
  /\beval\b/,
  /\|\s*xargs\b/,
  /\bbash\s+\S+\.sh\b/,
  /\bsh\s+\S+\.sh\b/,
];

const SAFE_COMMANDS = new Set([
  'echo', 'printf', 'npm', 'npx', 'node', 'yarn', 'pnpm', 'bun',
  'git', 'python', 'python3', 'pip', 'pip3',
  'curl', 'wget', 'ssh', 'scp',
  'ps', 'top', 'htop', 'df', 'du', 'free', 'uptime', 'whoami', 'which',
  'date', 'cal', 'env', 'printenv', 'set', 'export', 'alias', 'type',
  'grep', 'rg', 'find', 'ls', 'pwd', 'wc', 'sort', 'uniq', 'diff',
  'pm2', 'systemctl', 'journalctl',
]);

function splitCommands(commandStr) {
  const commands = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < commandStr.length) {
    const ch = commandStr[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; i++; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; i++; continue; }
    if (!inSingle && !inDouble) {
      if (ch === '&' && commandStr[i + 1] === '&') { commands.push(current.trim()); current = ''; i += 2; continue; }
      if (ch === '|' && commandStr[i + 1] === '|') { commands.push(current.trim()); current = ''; i += 2; continue; }
      if (ch === ';') { commands.push(current.trim()); current = ''; i++; continue; }
    }
    current += ch;
    i++;
  }
  if (current.trim()) commands.push(current.trim());
  return commands.filter(Boolean);
}

function tokenize(cmd) {
  const tokens = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < cmd.length) {
    const ch = cmd[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; i++; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; i++; continue; }
    if (!inSingle && !inDouble && (ch === ' ' || ch === '\t')) {
      if (current) { tokens.push(current); current = ''; }
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  if (current) tokens.push(current);
  return tokens;
}

function looksLikePath(token) {
  if (token.startsWith('-')) return false;
  if (token.startsWith('~')) return true;
  if (token.startsWith('/')) return true;
  if (token.startsWith('.')) return true;
  if (token.includes('/')) return true;
  if (/\.\w+$/.test(token)) return true;
  if (/^[\w][\w.-]*$/.test(token)) return true;
  return false;
}

function resolvePath(token, cwd) {
  if (token.startsWith('~/') || token === '~') {
    token = path.join(os.homedir(), token.slice(1));
  }
  if (path.isAbsolute(token)) return path.resolve(token);
  return path.resolve(cwd, token);
}

/**
 * Strip heredoc content from a command string.
 * Removes everything between << MARKER and MARKER (inclusive).
 * Handles both quoted (<<'EOF', <<"EOF") and unquoted (<<EOF) markers.
 */
function stripHeredocs(commandStr) {
  // Match << with optional - (for <<-), optional quotes around marker
  return commandStr.replace(/<<-?\s*['"]?(\w+)['"]?[\s\S]*?\n\1(?:\n|$)/g, '');
}

function extractPaths(commandStr, cwd) {
  if (!commandStr || !cwd) return { paths: [], unparseable: false, unparseableReason: null };

  // Strip heredoc content before analysis — heredoc bodies are data, not commands
  const stripped = stripHeredocs(commandStr);

  for (const pattern of UNPARSEABLE_PATTERNS) {
    if (pattern.test(stripped)) {
      const partialPaths = extractLiteralPaths(stripped, cwd);
      return {
        paths: partialPaths,
        unparseable: true,
        unparseableReason: 'Command contains dynamic patterns that cannot be statically analyzed',
      };
    }
  }

  const paths = extractLiteralPaths(stripped, cwd);
  return { paths, unparseable: false, unparseableReason: null };
}

function extractLiteralPaths(commandStr, cwd) {
  const subCommands = splitCommands(commandStr);
  const allPaths = [];
  let effectiveCwd = cwd;

  for (const sub of subCommands) {
    const pipeParts = sub.split(/\s*\|\s*/);
    const cmd = pipeParts[pipeParts.length - 1];
    const tokens = tokenize(cmd);
    if (tokens.length === 0) continue;
    const baseCmd = path.basename(tokens[0]);

    if (baseCmd === 'cd' && tokens.length >= 2) {
      const target = tokens[1];
      if (!target.startsWith('-')) {
        effectiveCwd = resolvePath(target, effectiveCwd);
      }
      continue;
    }

    if (SAFE_COMMANDS.has(baseCmd)) {
      if (baseCmd === 'git' && tokens.length >= 2) {
        const gitSub = tokens[1];
        if (GIT_PATH_COMMANDS.has(gitSub)) {
          const dashDashIdx = tokens.indexOf('--');
          const startIdx = dashDashIdx >= 0 ? dashDashIdx + 1 : 2;
          for (let i = startIdx; i < tokens.length; i++) {
            if (looksLikePath(tokens[i])) {
              allPaths.push(resolvePath(tokens[i], effectiveCwd));
            }
          }
        }
      }
      continue;
    }

    if (FS_COMMANDS.has(baseCmd)) {
      for (let i = 1; i < tokens.length; i++) {
        if (looksLikePath(tokens[i])) {
          allPaths.push(resolvePath(tokens[i], effectiveCwd));
        }
      }
      continue;
    }

    for (let i = 1; i < tokens.length; i++) {
      if (looksLikePath(tokens[i]) && tokens[i].includes('/')) {
        allPaths.push(resolvePath(tokens[i], effectiveCwd));
      }
    }
  }

  return [...new Set(allPaths)];
}

module.exports = { extractPaths, splitCommands, tokenize, resolvePath, looksLikePath };
