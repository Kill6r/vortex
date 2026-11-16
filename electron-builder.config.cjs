module.exports = {
  appId: 'dev.vortex.optimizer',
  productName: 'VORTEX',
  directories: { output: 'release' },
  files: ['dist/renderer/**/*', 'src/main/**/*', '!src/main/cpu-monitor/**/*', 'src/core/**/*', 'package.json'],
  extraResources: [{ from: 'src/main/helpers/standby-cleaner.ps1', to: 'helpers/standby-cleaner.ps1' }, { from: 'src/main/cpu-monitor', to: 'cpu-monitor' }],
  win: { target: 'nsis', icon: 'build/icon.ico' },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: false, include: 'build/installer.nsh', deleteAppDataOnUninstall: false },
  publish: [{ provider: 'github', owner: 'Kill6r', repo: 'vortex', releaseType: 'release' }]
};
