const github = process.env.GITHUB_REPOSITORY || process.env.VORTEX_GITHUB_REPOSITORY || '';
const generic = process.env.VORTEX_UPDATE_URL || '';
const publish = /^[\w.-]+\/[\w.-]+$/.test(github)
  ? [{ provider: 'github', owner: github.split('/')[0], repo: github.split('/')[1], releaseType: 'release' }]
  : /^https:\/\//i.test(generic)
    ? [{ provider: 'generic', url: generic }]
    : undefined;

module.exports = {
  appId: 'dev.vortex.optimizer',
  productName: 'VORTEX',
  directories: { output: 'release' },
  files: ['dist/renderer/**/*', 'src/main/**/*', 'src/core/**/*', 'package.json'],
  extraResources: [{ from: 'src/main/helpers/standby-cleaner.ps1', to: 'helpers/standby-cleaner.ps1' }],
  win: { target: 'nsis' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: false },
  ...(publish ? { publish } : {})
};
