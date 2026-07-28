// Bundle src/cli.tsx → dist/cli.js for `npx github:heartpleasure101-stack/dotagents`.
// react-devtools-core is Ink's optional peer; not installed at consumer sites.
// We stub it so the ESM resolver never chases the missing package.

const stubReactDevtools = {
  name: 'stub-react-devtools',
  setup(builder) {
    builder.onResolve({ filter: /^react-devtools-core$/ }, () => ({
      path: 'react-devtools-core-stub',
      namespace: 'stub',
    }));
    builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents:
        'export default {};\n' +
        'export const initialize = () => {};\n' +
        'export const connectToDevTools = () => {};\n',
      loader: 'js',
    }));
  },
};

const result = await Bun.build({
  entrypoints: ['src/cli.tsx'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  plugins: [stubReactDevtools],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const out of result.outputs) {
  console.log(`  ${out.path}  ${(out.size / 1024 / 1024).toFixed(2)} MB`);
}
