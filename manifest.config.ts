import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'BridalLive Helper',
  description:
    'Side workstation for BridalLive: inventory lookup, variant creation, and custom labels.',
  version: '0.3.0',
  minimum_chrome_version: '114',
  icons: {
    '16': 'public/icons/icon-16.png',
    '48': 'public/icons/icon-48.png',
    '128': 'public/icons/icon-128.png',
  },
  action: {
    default_title: 'BridalLive Helper',
    default_icon: {
      '16': 'public/icons/icon-16.png',
      '48': 'public/icons/icon-48.png',
    },
  },
  side_panel: {
    default_path: 'src/panel/index.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  permissions: ['storage', 'tabs', 'sidePanel'],
  host_permissions: ['https://app.bridallive.com/*', 'https://*.bridallive.com/*'],
  content_scripts: [
    {
      matches: ['https://app.bridallive.com/*', 'https://*.bridallive.com/*'],
      js: ['src/content/bridallive.ts', 'src/content/panel-launcher.ts'],
      css: ['src/content/panel-launcher.css'],
      run_at: 'document_idle',
    },
  ],
})
