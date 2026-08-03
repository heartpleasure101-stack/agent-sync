import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { scanInstalledSkills } from '../src/core/scan-installed.js';
import { buildLinkPlan } from '../src/core/plan.js';
import { applyLinkPlan } from '../src/core/apply.js';
import { createBackupSession, finalizeBackup, backupPath } from '../src/core/backup.js';
import { undoLastChange } from '../src/core/undo.js';
import { makeTempDir } from './helpers.js';

describe('broken link recovery e2e verification', () => {
  test('diagnoses broken root, isolates affected client, cleans and applies successfully, and undoes correctly', async () => {
    const project = await makeTempDir('agent-sync-e2e-broken-');
    const canonicalOverride = path.join(project, '.agents');
    const skillDir = path.join(canonicalOverride, 'skills', '01_Coding', 'my-skill');
    await fs.promises.mkdir(skillDir, { recursive: true });
    await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill\n');

    // Setup claude skills root as a broken symlink
    const claudeDir = path.join(project, '.claude');
    await fs.promises.mkdir(claudeDir, { recursive: true });
    const claudeSkills = path.join(claudeDir, 'skills');
    const nonExistentTarget = path.join(project, 'non-existent-skills');
    await fs.promises.symlink(nonExistentTarget, claudeSkills);

    // Setup gemini skills root as normal directory
    const geminiDir = path.join(project, '.gemini');
    await fs.promises.mkdir(geminiDir, { recursive: true });

    // 1. Scan installed skills
    const scanRes = await scanInstalledSkills({
      scope: 'project',
      projectRoot: project,
      clients: ['claude', 'gemini'],
      canonicalOverride,
    });
    expect(scanRes.installed.size).toBe(0);
    expect(scanRes.brokenRoots).toHaveLength(1);
    expect(scanRes.brokenRoots[0].client).toBe('claude');
    expect(scanRes.brokenRoots[0].path).toBe(claudeSkills);

    // 2. Build link plan
    const plan = await buildLinkPlan({
      scope: 'project',
      projectRoot: project,
      clients: ['claude', 'gemini'],
      selectedSkills: [skillDir],
      canonicalOverride,
    });

    const claudeTask = plan.tasks.find((t) => 'target' in t && t.target.includes('.claude/skills'));
    const geminiTask = plan.tasks.find((t) => 'target' in t && t.target.includes('.gemini/skills'));

    expect(claudeTask?.type).toBe('blocked-root');
    expect(geminiTask?.type).toBe('link');

    // 3. Clean broken root & apply plan
    const backup = await createBackupSession({ canonicalRoot: canonicalOverride, scope: 'project', operation: 'test' });
    
    // Clean claude root
    await backupPath(claudeSkills, backup);
    await fs.promises.mkdir(claudeSkills, { recursive: true });

    // Convert claudeTask to link task after cleaning
    if (claudeTask && claudeTask.type === 'blocked-root') {
      (claudeTask as any).type = 'link';
      (claudeTask as any).kind = 'dir';
    }

    const applyRes = await applyLinkPlan(plan, { backup });
    await finalizeBackup(backup);

    expect(applyRes.applied).toBeGreaterThan(0);
    expect(applyRes.failed).toBe(0);

    // Verify links exist for both claude and gemini
    const claudeInstalledSkill = path.join(claudeSkills, 'my-skill');
    const geminiInstalledSkill = path.join(project, '.gemini', 'skills', 'my-skill');
    expect(await fs.promises.lstat(claudeInstalledSkill).then((s) => s.isSymbolicLink())).toBe(true);
    expect(await fs.promises.lstat(geminiInstalledSkill).then((s) => s.isSymbolicLink())).toBe(true);

    // 4. Undo change
    const undoRes = await undoLastChange({ scope: 'project', projectRoot: project, canonicalOverride });
    expect(undoRes.restored).toBeGreaterThan(0);

    // Verify claude skills root restored to broken symlink
    const claudeStat = await fs.promises.lstat(claudeSkills);
    expect(claudeStat.isSymbolicLink()).toBe(true);
    const restoredLink = await fs.promises.readlink(claudeSkills);
    expect(restoredLink).toBe(nonExistentTarget);
  });
});
