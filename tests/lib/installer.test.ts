import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { installKit } from '../../src/lib/installer.js';
import { PACKAGE_ROOT } from '../../src/utils/paths.js';

vi.mock('node:fs');

describe('installKit', () => {
  const mockTargetDir = '/test/target';
  let consoleLogSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should log installation message', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      `Installing WordPress Agent Kit (github) into: ${mockTargetDir}`
    );
  });

  it('should create target directory if it does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === mockTargetDir) return false;
      return true;
    });
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.mkdirSync).toHaveBeenCalledWith(mockTargetDir, { recursive: true });
  });

  it('should not create target directory if it exists', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.mkdirSync).not.toHaveBeenCalledWith(mockTargetDir, expect.anything());
  });

  it('should remove existing .github directory before copying', async () => {
    const targetGithub = path.join(mockTargetDir, '.github');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.rmSync).toHaveBeenCalledWith(targetGithub, { recursive: true, force: true });
  });

  it('should copy .github directory to platform folder', async () => {
    const targetGithub = path.join(mockTargetDir, '.github');
    const githubPath = path.join(PACKAGE_ROOT, '.github');
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.cpSync).toHaveBeenCalledWith(githubPath, targetGithub, { recursive: true });
  });

  it('should throw error if .github directory does not exist', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('.github') && !p.includes(mockTargetDir)) {
        return false;
      }
      return true;
    });

    await expect(installKit(mockTargetDir)).rejects.toThrow('Could not find source .github directory.');
  });

  it('should copy AGENTS.template.md if it exists', async () => {
    const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
    const targetAgentsTemplate = path.join(mockTargetDir, 'AGENTS.template.md');
    
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === path.join(mockTargetDir, 'AGENTS.md')) return true;
      return true;
    });
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.copyFileSync).toHaveBeenCalledWith(templatePath, targetAgentsTemplate);
  });

  it('should copy AGENTS.md from template if target does not exist', async () => {
    const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
    const targetAgents = path.join(mockTargetDir, 'AGENTS.md');
    
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === targetAgents) return false;
      return true;
    });
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.copyFileSync).toHaveBeenCalledWith(templatePath, targetAgents);
  });

  it('should copy AGENTS.md from source if template does not exist', async () => {
    const templatePath = path.join(PACKAGE_ROOT, 'AGENTS.template.md');
    const agentsPath = path.join(PACKAGE_ROOT, 'AGENTS.md');
    const targetAgents = path.join(mockTargetDir, 'AGENTS.md');
    
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      if (p === targetAgents) return false;
      if (p === templatePath) return false;
      return true;
    });
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    expect(fs.copyFileSync).toHaveBeenCalledWith(agentsPath, targetAgents);
  });

  it('should not copy AGENTS.md if it already exists in target', async () => {
    const targetAgents = path.join(mockTargetDir, 'AGENTS.md');
    
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      return true; // Everything exists including target AGENTS.md
    });
    vi.mocked(fs.rmSync).mockReturnValue(undefined);
    vi.mocked(fs.cpSync).mockReturnValue(undefined);
    vi.mocked(fs.copyFileSync).mockReturnValue(undefined);

    await installKit(mockTargetDir);

    const copyFileCallsForAgents = vi.mocked(fs.copyFileSync).mock.calls.filter(
      call => call[1] === targetAgents
    );
    expect(copyFileCallsForAgents).toHaveLength(0);
  });
});
