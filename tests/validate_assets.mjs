#!/usr/bin/env node
// TravelGuide asset validation
// 只使用 Node.js 标准库；纯只读——不修改任何文件。
// 校验对象是资产结构与最基本不变量；不是实时旅游信息验证。

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SKILLS_DIR = path.join(ROOT, '.agents', 'skills');
const DEMO_DIR = path.join(ROOT, 'examples', 'tokyo-demo');
const PLAN_DIR = path.join(ROOT, 'plan');
const GITIGNORE = path.join(ROOT, '.gitignore');

const EXPECTED_SKILLS = [
  'travel-guide', 'travel-profile', 'web-research', 'poi-attraction',
  'review-analysis', 'weather', 'map-route', 'food-restaurant',
  'ticket-reservation', 'itinerary-planner', 'trip-validator', 'travel-copilot',
];
const EXPECTED_ASSETS = [
  'profile.json', 'research.json', 'candidates.json', 'review-analysis.json',
  'weather.json', 'map-route.json', 'food-restaurant.json',
  'ticket-reservation.json', 'itinerary.json', 'validation.json', 'copilot.json',
];

const failures = [];
let ran = 0;
const check = (name, cond) => { ran++; if (!cond) failures.push(name); return cond; };
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// ---------- A. Skill 完整性 ----------
for (const skill of EXPECTED_SKILLS) {
  const dir = path.join(SKILLS_DIR, skill);
  const file = path.join(dir, 'SKILL.md');
  check(`skill/${skill}/dir-exists`, fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  if (!fs.existsSync(file)) { failures.push(`skill/${skill}/SKILL.md-exists`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  check(`skill/${skill}/frontmatter`, !!fm);
  if (!fm) continue;
  const name = (fm[1].match(/^name:\s*(\S+)\s*$/m) || [])[1];
  const desc = (fm[1].match(/^description:\s*(.+)$/m) || [])[1];
  check(`skill/${skill}/name-matches-dir`, name === skill);
  check(`skill/${skill}/description-nonempty`, !!desc && desc.trim().length > 0);
  check(`skill/${skill}/description-length`, !!desc && desc.trim().length <= 1024);
}

// ---------- B/C/D. Demo JSON 完整性与资产引用 ----------
for (const asset of EXPECTED_ASSETS) {
  const f = path.join(DEMO_DIR, asset);
  check(`demo/${asset}/exists`, fs.existsSync(f));
  if (!fs.existsSync(f)) { failures.push(`demo/${asset}/parse`); continue; }
  let ok = true;
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch { ok = false; }
  check(`demo/${asset}/parse`, ok);
}

// ---------- E. itinerary 基础不变量 ----------
let itinerary = null;
try { itinerary = readJSON(path.join(DEMO_DIR, 'itinerary.json')); } catch { /* 已由 D 记录 */ }
if (itinerary) {
  check('itinerary/status-draft', itinerary.trip_meta?.status === 'draft');
  check('itinerary/days-exist', Array.isArray(itinerary.days) && itinerary.days.length > 0);
  for (const d of itinerary.days) {
    check(`itinerary/${d.date}/has-date`, typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
    check(`itinerary/${d.date}/has-load`, !!d.load);
    for (const a of d.activities || []) {
      check(`itinerary/${d.date}/activity-start-end/${(a.name || '').slice(0, 16)}`,
        typeof a.start === 'string' && typeof a.end === 'string' && a.start !== '' && a.end !== '');
      check(`itinerary/${d.date}/activity-source-ref/${(a.name || '').slice(0, 16)}`, !!a.source_reference);
    }
  }
  // meals 不重复嵌套：同一天内不允许两段完全相同的 meal 槽
  for (const d of itinerary.days) {
    const seen = new Set();
    for (const m of d.meals || []) {
      const key = `${m.start}|${m.end}|${m.name}`;
      check(`itinerary/${d.date}/meal-unique/${m.name.slice(0, 16)}`, !seen.has(key));
      seen.add(key);
    }
  }
  for (const d of itinerary.days) {
    for (const tf of d.transfers || []) {
      check(`itinerary/${d.date}/transfer-matrix-ref/${(tf.from || '').slice(0, 12)}`, !!tf.matrix_reference);
    }
  }
}

// ---------- F. validation 基础规则 ----------
let validation = null;
try { validation = readJSON(path.join(DEMO_DIR, 'validation.json')); } catch { /* 已由 D 记录 */ }
if (validation) {
  check('validation/round-exists', Number.isInteger(validation.round));
  check('validation/status-exists', ['pass', 'pass_with_warnings', 'fail'].includes(validation.status));
  const errs = (validation.issues || []).filter(i => i.severity === 'error').length;
  const warns = (validation.issues || []).filter(i => i.severity === 'warning').length;
  check('validation/counts-consistent', validation.error_count === errs && validation.warning_count === warns);
  check('validation/status-rule',
    (validation.error_count > 0 && validation.status === 'fail') ||
    (validation.error_count === 0 && validation.warning_count > 0 && validation.status === 'pass_with_warnings') ||
    (validation.error_count === 0 && validation.warning_count === 0 && validation.status === 'pass'));
}

// ---------- G. copilot 基础规则 ----------
let copilot = null;
try { copilot = readJSON(path.join(DEMO_DIR, 'copilot.json')); } catch { /* 已由 D 记录 */ }
if (copilot) {
  for (const key of ['event', 'current_state', 'impact_analysis', 'proposed_changes',
    'preserved_anchors', 'validation', 'change_log']) {
    check(`copilot/${key}-exists`, key in copilot);
  }
  check('copilot/simulated-event', copilot.event?.source === 'simulated_user_event');
  check('copilot/no-new-itinerary', !('days' in copilot) && !('itinerary' in copilot));
}

// ---------- H. .gitignore 规则（Git 可用则核验，否则 skip） ----------
check('gitignore/exists', fs.existsSync(GITIGNORE));
const gi = fs.existsSync(GITIGNORE) ? fs.readFileSync(GITIGNORE, 'utf8') : '';
check('gitignore/plan-json-rule', gi.includes('plan/*.json'));
const probe = path.join('plan', 'profile.json');
if (fs.existsSync(path.join(ROOT, probe)) && !gi.includes('plan/*.json')) {
  failures.push('gitignore/plan-json-coverage');
} else if (fs.existsSync(GITIGNORE)) {
  const git = spawnSync('git', ['-C', ROOT, 'check-ignore', '-v', probe], { encoding: 'utf8' });
  if (git.status === 0) {
    check('gitignore/plan-ignored-by-git', (git.stdout || '').includes('plan/*.json'));
    const ex = spawnSync('git', ['-C', ROOT, 'check-ignore', path.join('examples', 'tokyo-demo', 'profile.json')], { encoding: 'utf8' });
    check('gitignore/examples-not-ignored', ex.status !== 0);
  } else {
    console.log('skip: git check-ignore 不可用（不影响 PASS/FAIL 判定）');
  }
}

// ---------- plan/ 可选解析检查 ----------
if (fs.existsSync(PLAN_DIR)) {
  for (const f of fs.readdirSync(PLAN_DIR).filter(x => x.endsWith('.json'))) {
    let ok = true;
    try { JSON.parse(fs.readFileSync(path.join(PLAN_DIR, f), 'utf8')); } catch { ok = false; }
    check(`plan/${f}/parse`, ok);
  }
}

// ---------- 输出 ----------
const checked = `checks run: ${ran}`;
if (failures.length === 0) {
  console.log(`TravelGuide asset validation: PASS (${checked})`);
  process.exit(0);
}
console.log('TravelGuide asset validation: FAIL');
for (const f of failures) console.log(` - ${f}`);
console.log(`(${checked})`);
process.exit(1);
