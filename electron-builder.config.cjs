module.exports = {
  appId: 'dev.vortex.optimizer',
  productName: 'VORTEX',
  directories: { output: 'release' },
  files: ['dist/renderer/**/*', 'src/main/**/*', 'src/core/**/*', 'package.json'],
  extraResources: [{ from: 'src/main/helpers/standby-cleaner.ps1', to: 'helpers/standby-cleaner.ps1' }],
  win: { target: 'nsis' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: false, include: 'build/installer.nsh', deleteAppDataOnUninstall: false },
  publish: [{ provider: 'github', owner: 'Kill6r', repo: 'vortex', releaseType: 'release' }]
};
