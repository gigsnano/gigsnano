import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --verbose scans on large diffs can exceed spawnSync's 1 MiB default.
const SPAWN_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);

const readFileOrEmpty = (source) => {
  try {
    return readFileSync(source, 'utf8');
  } catch {
    return '';
  }
};

const shouldScan = (input) => {
  const eventName = input.hook_event_name || input.eventName || input.event_name;
  if (eventName === 'PostToolBatch') {
    const toolCalls = Array.isArray(input.tool_calls) ? input.tool_calls : [];
    return toolCalls.some((toolCall) => EDIT_TOOL_NAMES.has(toolCall.tool_name));
  }
  const toolName = input.tool_name || input.toolName || input.tool;
  return !toolName || EDIT_TOOL_NAMES.has(toolName);
};

const runReactDoctor = (outputPath) => {
  // Each candidate is a single shell command string (not an args array):
  // `shell: true` is required to run the Windows `.cmd` shims, and an args
  // array with `shell: true` trips Node's DEP0190. A missing command exits
  // 127 via a POSIX shell (no ENOENT error) and 9009 via cmd.exe, so fall
  // through on those. The local bin is probed with existsSync (its `./`
  // prefix form is not runnable by cmd.exe at all). With no runner found,
  // exit 0 silently — stdout is parsed as the hook's JSON.
  const localBin = process.platform === 'win32'
    ? 'node_modules\\.bin\\react-doctor.cmd'
    : './node_modules/.bin/react-doctor';
  const commands = [
    ...(existsSync(localBin)
      ? [localBin + ' --verbose --scope changed --blocking warning --no-score']
      : []),
    'react-doctor --verbose --scope changed --blocking warning --no-score',
    'pnpm dlx react-doctor@latest --verbose --scope changed --blocking warning --no-score',
    'npx --yes react-doctor@latest --verbose --scope changed --blocking warning --no-score',
  ];

  // Windows cmd.exe reports "not recognized" as status 1 (not 9009/127), so a
  // missing runner must also be detected from the shell's not-found message or
  // the hook stops at the bare command and surfaces the shell error as a false
  // "issues found" — never reaching the npx fallback.
  const SHELL_NOT_FOUND =
    /is not recognized as an internal or external command|(^|\n)[^\n]*: command not found|(^|\n)[^\n]*: not found/i;

  for (const command of commands) {
    const result = spawnSync(command, { encoding: 'utf8', shell: true, maxBuffer: SPAWN_MAX_BUFFER_BYTES });
    const missing =
      result.error?.code === 'ENOENT' ||
      result.status === 127 ||
      result.status === 9009 ||
      (result.status !== 0 && SHELL_NOT_FOUND.test((result.stderr || '') + (result.stdout || '')));
    if (missing) continue;
    try {
      writeFileSync(outputPath, (result.stdout || '') + (result.stderr || ''));
    } catch {}
    return result.status;
  }

  return 0;
};

const cleanup = (...paths) => {
  for (const path of paths) {
    try { unlinkSync(path); } catch {}
  }
};

const main = () => {
  let input;
  try {
    input = JSON.parse(readFileOrEmpty(0) || '{}');
  } catch {
    input = {};
  }

  if (!shouldScan(input)) {
    process.exit(0);
  }

  const projectRoot = join(process.env.CLAUDE_PROJECT_DIR || join(__dirname, '../..'), 'apps/web');
  const outputPath = join(tmpdir(), `react-doctor-agent-hook-output-${process.pid}.txt`);

  try {
    process.chdir(projectRoot);
  } catch {
    process.exit(0);
  }

  // With no working-tree changes, `--scope changed` falls back to a full-repo
  // scan and dumps pre-existing residue on every edit that touched only files
  // outside the repo (e.g. memory/notes). Nothing changed here => nothing to
  // check.
  const gitStatus = spawnSync('git status --porcelain', {
    encoding: 'utf8',
    shell: true,
    maxBuffer: SPAWN_MAX_BUFFER_BYTES,
  });
  if (!gitStatus.error && gitStatus.status === 0 && !(gitStatus.stdout || '').trim()) {
    process.exit(0);
  }

  const scanResult = runReactDoctor(outputPath);
  if (scanResult === 0) {
    cleanup(outputPath);
    process.exit(0);
  }

  // The write above is best-effort (unwritable tmpdir), so the read is too
  // — a hook must never crash the agent loop with a stack trace.
  const scanOutput = readFileOrEmpty(outputPath).trim();
  cleanup(outputPath);

  if (!scanOutput) {
    process.exit(0);
  }

  const message = `React Doctor found issues in the changed files. Review this output and fix the regressions before finishing. For confirmed issues that cannot be fixed now, create GitHub issues with the rule, file/line, confidence, impact, and proposed fix.\n\n${scanOutput}`;

  if (input.hook_event_name === 'PostToolBatch') {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolBatch', additionalContext: message } }));
  } else {
    console.log(JSON.stringify({ additional_context: message }));
  }
};

main();