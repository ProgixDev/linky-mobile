#!/usr/bin/env node
/**
 * agent-board — minimal file-based task board for the /build-task pipeline.
 *
 *   node scripts/agent-board.mjs list                  # all tasks + BUILDABLE marker
 *   node scripts/agent-board.mjs next                  # first buildable task (one line)
 *   node scripts/agent-board.mjs show TASK-001         # print a task file
 *   node scripts/agent-board.mjs set-status TASK-001 "In Progress"
 *
 * Tasks live in .agent-board/tasks/<ID>.md with frontmatter:
 *   ---
 *   id: TASK-001
 *   title: Capture a task
 *   status: Todo             # Todo | In Progress | Review | Done
 *   blockedBy: [TASK-000]    # ids that must be Done before this is buildable
 *   ---
 * A task is BUILDABLE when status is Todo and every blockedBy task is Done.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STATUSES = ['Todo', 'In Progress', 'Review', 'Done'];
const TASKS_DIR = join(process.cwd(), '.agent-board', 'tasks');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseTask(file) {
  const raw = readFileSync(file, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) fail(`No frontmatter in ${file}`);
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    fm[key] = val;
  }
  fm.blockedBy = Array.isArray(fm.blockedBy) ? fm.blockedBy : fm.blockedBy ? [fm.blockedBy] : [];
  fm._file = file;
  fm._raw = raw;
  return fm;
}

function loadTasks() {
  if (!existsSync(TASKS_DIR)) fail(`No tasks dir: ${TASKS_DIR}`);
  return readdirSync(TASKS_DIR)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => parseTask(join(TASKS_DIR, f)))
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''));
}

function isBuildable(t, byId) {
  return t.status === 'Todo' && t.blockedBy.every((id) => byId.get(id)?.status === 'Done');
}

const [cmd, ...args] = process.argv.slice(2);
const tasks = loadTasks();
const byId = new Map(tasks.map((t) => [t.id, t]));

switch (cmd) {
  case 'list': {
    if (!tasks.length) {
      console.log('(no tasks in .agent-board/tasks/)');
      break;
    }
    for (const t of tasks) {
      const openBlockers = t.blockedBy.filter((id) => byId.get(id)?.status !== 'Done');
      const mark = t.status === 'Done' ? '✓ Done' : isBuildable(t, byId) ? 'BUILDABLE' : t.status;
      const blockers = openBlockers.length ? `  blockedBy: ${openBlockers.join(', ')}` : '';
      console.log(
        `${(t.id || '?').padEnd(10)} ${String(mark).padEnd(12)} ${t.title || ''}${blockers}`,
      );
    }
    break;
  }
  case 'next': {
    const n = tasks.find((t) => isBuildable(t, byId));
    console.log(n ? `${n.id} — ${n.title || ''}` : '(no buildable tasks)');
    break;
  }
  case 'show': {
    const t = byId.get(args[0]);
    if (!t) fail(`Unknown task: ${args[0]}`);
    console.log(t._raw);
    break;
  }
  case 'set-status': {
    const [id, ...rest] = args;
    const status = rest.join(' ').replace(/^["']|["']$/g, '');
    const t = byId.get(id);
    if (!t) fail(`Unknown task: ${id}`);
    if (!STATUSES.includes(status))
      fail(`Invalid status "${status}". Use one of: ${STATUSES.join(', ')}`);
    if (!/^status:\s*.*$/m.test(t._raw)) fail(`No "status:" line in ${t._file}`);
    writeFileSync(t._file, t._raw.replace(/^(status:\s*).*$/m, `$1${status}`));
    console.log(`${id} → ${status}`);
    break;
  }
  default:
    console.log(
      'Usage: agent-board <list|next|show|set-status> [args]\n' +
        '  list                       all tasks + BUILDABLE marker\n' +
        '  next                       first buildable task\n' +
        '  show TASK-001              print a task file\n' +
        '  set-status TASK-001 "Done" update status',
    );
    process.exit(cmd ? 1 : 0);
}
