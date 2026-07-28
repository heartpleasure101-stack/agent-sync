// Preflight — MUST only import from node:* built-ins (or relative preflight files).
import type { CheckFail } from './runtime-check.js';

const OFFICIAL_URL = 'https://nodejs.org';

type Guide = { headline: string; command: string | null };

function guideFor(platform: NodeJS.Platform, minimum: number): Guide {
  switch (platform) {
    case 'darwin':
      return { headline: 'macOS 建議安裝方式', command: `brew install node@${minimum}` };
    case 'linux':
      return { headline: 'Linux 建議安裝方式（使用 nvm）', command: `nvm install ${minimum}` };
    case 'win32':
      return { headline: 'Windows 建議安裝方式', command: 'winget install OpenJS.NodeJS' };
    default:
      return { headline: '請至官網下載安裝檔', command: null };
  }
}

export function formatFailureMessage(result: CheckFail): string {
  const guide = guideFor(result.platform, result.minimum);
  const lines: string[] = [];
  lines.push('✖ Node.js 版本過舊，dotagents 無法啟動');
  lines.push('');
  lines.push(`  目前版本：${result.current}`);
  lines.push(`  需要版本：${result.minimum}.0.0 以上`);
  lines.push('');
  lines.push(`  ${guide.headline}：`);
  if (guide.command) {
    lines.push(`    $ ${guide.command}`);
  }
  lines.push(`    官網：${OFFICIAL_URL}`);
  lines.push('');
  lines.push('  安裝完成後，重開終端機再跑一次：');
  lines.push('    $ npx github:heartpleasure101-stack/dotagents');
  return lines.join('\n');
}
