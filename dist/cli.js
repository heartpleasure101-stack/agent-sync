#!/usr/bin/env node
import process from "node:process";
var MINIMUM_NODE_MAJOR = 22;
function checkNodeVersion(processLike) {
  const raw = processLike.versions.node ?? "";
  const majorStr = raw.split(".")[0] ?? "";
  const major = Number.parseInt(majorStr, 10);
  if (!Number.isFinite(major) || major < MINIMUM_NODE_MAJOR) {
    return {
      ok: false,
      current: raw || "unknown",
      minimum: MINIMUM_NODE_MAJOR,
      platform: processLike.platform
    };
  }
  return { ok: true };
}
var OFFICIAL_URL = "https://nodejs.org";
function guideFor(platform, minimum) {
  switch (platform) {
    case "darwin":
      return { headline: "macOS \u5EFA\u8B70\u5B89\u88DD\u65B9\u5F0F", command: `brew install node@${minimum}` };
    case "linux":
      return { headline: "Linux \u5EFA\u8B70\u5B89\u88DD\u65B9\u5F0F\uFF08\u4F7F\u7528 nvm\uFF09", command: `nvm install ${minimum}` };
    case "win32":
      return { headline: "Windows \u5EFA\u8B70\u5B89\u88DD\u65B9\u5F0F", command: "winget install OpenJS.NodeJS" };
    default:
      return { headline: "\u8ACB\u81F3\u5B98\u7DB2\u4E0B\u8F09\u5B89\u88DD\u6A94", command: null };
  }
}
function formatFailureMessage(result) {
  const guide = guideFor(result.platform, result.minimum);
  const lines = [];
  lines.push("\u2716 Node.js \u7248\u672C\u904E\u820A\uFF0Cagent-sync \u7121\u6CD5\u555F\u52D5");
  lines.push("");
  lines.push(`  \u76EE\u524D\u7248\u672C\uFF1A${result.current}`);
  lines.push(`  \u9700\u8981\u7248\u672C\uFF1A${result.minimum}.0.0 \u4EE5\u4E0A`);
  lines.push("");
  lines.push(`  ${guide.headline}\uFF1A`);
  if (guide.command) {
    lines.push(`    $ ${guide.command}`);
  }
  lines.push(`    \u5B98\u7DB2\uFF1A${OFFICIAL_URL}`);
  lines.push("");
  lines.push("  \u5B89\u88DD\u5B8C\u6210\u5F8C\uFF0C\u91CD\u958B\u7D42\u7AEF\u6A5F\u518D\u8DD1\u4E00\u6B21\uFF1A");
  lines.push("    $ npx github:heartpleasure101-stack/agent-sync");
  return lines.join(`
`);
}
var check = checkNodeVersion(process);
if (!check.ok) {
  process.stderr.write(formatFailureMessage(check) + `
`);
  process.exit(1);
}
var mainUrl = new URL("./main.js", import.meta.url);
try {
  await import(mainUrl.href);
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  process.stderr.write(`\u2716 agent-sync \u4E3B\u7A0B\u5F0F\u8F09\u5165\u5931\u6557

  \u9810\u671F\u8DEF\u5F91\uFF1A${mainUrl.pathname}
  \u539F\u56E0\uFF1A${detail}

  \u9019\u901A\u5E38\u8868\u793A\u5B89\u88DD\u4E0D\u5B8C\u6574\u6216\u5EFA\u7F6E\u7522\u7269\u7F3A\u5C11 main.js\u3002
  \u8ACB\u91CD\u65B0\u5B89\u88DD\u5F8C\u518D\u8A66\uFF1A
    $ npx github:heartpleasure101-stack/agent-sync
`);
  process.exit(1);
}
