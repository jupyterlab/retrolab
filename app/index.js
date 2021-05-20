// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// Inspired by: https://github.com/jupyterlab/jupyterlab/blob/master/dev_mode/index.js

import { PageConfig, URLExt } from '@jupyterlab/coreutils';

// Promise.allSettled polyfill, until our supported browsers implement it
// See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
if (Promise.allSettled === undefined) {
  Promise.allSettled = promises =>
    Promise.all(
      promises.map(promise =>
        promise.then(
          value => ({
            status: 'fulfilled',
            value
          }),
          reason => ({
            status: 'rejected',
            reason
          })
        )
      )
    );
}

require('./style.js');
require('./extraStyle.js');

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const newScript = document.createElement('script');
    newScript.onerror = reject;
    newScript.onload = resolve;
    newScript.async = true;
    document.head.appendChild(newScript);
    newScript.src = url;
  });
}
async function loadComponent(url, scope) {
  await loadScript(url);

  // From MIT-licensed https://github.com/module-federation/module-federation-examples/blob/af043acd6be1718ee195b2511adf6011fba4233c/advanced-api/dynamic-remotes/app1/src/App.js#L6-L12
  // eslint-disable-next-line no-undef
  await __webpack_init_sharing__('default');
  const container = window._JUPYTERLAB[scope];
  // Initialize the container, it may provide shared modules and may need ours
  // eslint-disable-next-line no-undef
  await container.init(__webpack_share_scopes__.default);
}

async function createModule(scope, module) {
  try {
    const factory = await window._JUPYTERLAB[scope].get(module);
    return factory();
  } catch (e) {
    console.warn(
      `Failed to create module: package: ${scope}; module: ${module}`
    );
    throw e;
  }
}

/**
 * The main function
 */
async function main() {
  // load extra packages
  require('@jupyterlab/celltags');

  const mimeExtensions = [
    require('@jupyterlab/javascript-extension'),
    require('@jupyterlab/json-extension'),
    require('@jupyterlab/pdf-extension'),
    require('@jupyterlab/vega5-extension')
  ];

  const RetroApp = require('@retrolab/application').RetroApp;
  const app = new RetroApp({ mimeExtensions });

  const disabled = [];
  // TODO: formalize the way the set of initial extensions and plugins are specified
  let mods = [
    // @retrolab plugins
    require('@retrolab/application-extension'),
    require('@retrolab/docmanager-extension'),
    require('@retrolab/help-extension'),
    require('@retrolab/notebook-extension'),
    // to handle opening new tabs after creating a new terminal
    require('@retrolab/terminal-extension'),

    // @jupyterlab plugins
    require('@jupyterlab/apputils-extension').default.filter(({ id }) =>
      [
        '@jupyterlab/apputils-extension:palette',
        '@jupyterlab/apputils-extension:settings',
        '@jupyterlab/apputils-extension:themes',
        '@jupyterlab/apputils-extension:themes-palette-menu'
      ].includes(id)
    ),
    require('@jupyterlab/codemirror-extension').default.filter(({ id }) =>
      [
        '@jupyterlab/codemirror-extension:services',
        '@jupyterlab/codemirror-extension:codemirror'
      ].includes(id)
    ),
    require('@jupyterlab/completer-extension').default.filter(({ id }) =>
      ['@jupyterlab/completer-extension:manager'].includes(id)
    ),
    require('@jupyterlab/docmanager-extension').default.filter(({ id }) =>
      ['@jupyterlab/docmanager-extension:plugin'].includes(id)
    ),
    require('@jupyterlab/mainmenu-extension'),
    require('@jupyterlab/mathjax2-extension'),
    require('@jupyterlab/notebook-extension').default.filter(({ id }) =>
      [
        '@jupyterlab/notebook-extension:factory',
        '@jupyterlab/notebook-extension:tracker',
        '@jupyterlab/notebook-extension:widget-factory'
      ].includes(id)
    ),
    require('@jupyterlab/rendermime-extension'),
    require('@jupyterlab/shortcuts-extension'),
    // so new terminals can be create from the menu
    require('@jupyterlab/terminal-extension'),
    require('@jupyterlab/theme-light-extension'),
    require('@jupyterlab/theme-dark-extension')
  ];

  // The motivation here is to only load a specific set of plugins dependending on
  // the current page
  const page = PageConfig.getOption('retroPage');
  switch (page) {
    case 'tree': {
      mods = mods.concat([
        require('@jupyterlab/filebrowser-extension').default.filter(({ id }) =>
          [
            '@jupyterlab/filebrowser-extension:browser',
            '@jupyterlab/filebrowser-extension:download',
            '@jupyterlab/filebrowser-extension:factory',
            '@jupyterlab/filebrowser-extension:file-upload-status',
            '@jupyterlab/filebrowser-extension:open-with',
            '@jupyterlab/filebrowser-extension:share-file'
          ].includes(id)
        ),
        require('@retrolab/tree-extension'),
        require('@jupyterlab/running-extension')
      ]);
      break;
    }
    case 'notebooks': {
      mods = mods.concat([
        require('@jupyterlab/completer-extension').default.filter(({ id }) =>
          ['@jupyterlab/completer-extension:notebooks'].includes(id)
        ),
        require('@jupyterlab/tooltip-extension').default.filter(({ id }) =>
          [
            '@jupyterlab/tooltip-extension:manager',
            '@jupyterlab/tooltip-extension:notebooks'
          ].includes(id)
        )
      ]);
      break;
    }
    case 'edit': {
      mods = mods.concat([
        require('@jupyterlab/completer-extension').default.filter(({ id }) =>
          ['@jupyterlab/completer-extension:files'].includes(id)
        ),
        require('@jupyterlab/fileeditor-extension').default.filter(({ id }) =>
          ['@jupyterlab/fileeditor-extension:plugin'].includes(id)
        ),
        require('@jupyterlab/fileeditor-extension').default.filter(({ id }) =>
          ['@jupyterlab/fileeditor-extension:factory'].includes(id)
        )
      ]);
      break;
    }
  }

  /**
   * Iterate over active plugins in an extension.
   *
   * #### Notes
   * This also populates the disabled
   */
  function* activePlugins(extension) {
    // Handle commonjs or es2015 modules
    let exports;
    if (Object.prototype.hasOwnProperty.call(extension, '__esModule')) {
      exports = extension.default;
    } else {
      // CommonJS exports.
      exports = extension;
    }

    let plugins = Array.isArray(exports) ? exports : [exports];
    for (let plugin of plugins) {
      if (PageConfig.Extension.isDisabled(plugin.id)) {
        disabled.push(plugin.id);
        continue;
      }
      yield plugin;
    }
  }

  const extension_data = JSON.parse(
    PageConfig.getOption('federated_extensions')
  );

  const federatedExtensionPromises = [];
  const federatedMimeExtensionPromises = [];
  const federatedStylePromises = [];

  const extensions = await Promise.allSettled(
    extension_data.map(async data => {
      await loadComponent(
        `${URLExt.join(
          PageConfig.getOption('fullLabextensionsUrl'),
          data.name,
          data.load
        )}`,
        data.name
      );
      return data;
    })
  );

  extensions.forEach(p => {
    if (p.status === 'rejected') {
      // There was an error loading the component
      console.error(p.reason);
      return;
    }

    const data = p.value;
    if (data.extension) {
      federatedExtensionPromises.push(createModule(data.name, data.extension));
    }
    if (data.mimeExtension) {
      federatedMimeExtensionPromises.push(
        createModule(data.name, data.mimeExtension)
      );
    }
    if (data.style) {
      federatedStylePromises.push(createModule(data.name, data.style));
    }
  });

  // Add the federated extensions.
  // TODO: Add support for disabled extensions
  const federatedExtensions = await Promise.allSettled(
    federatedExtensionPromises
  );
  federatedExtensions.forEach(p => {
    if (p.status === 'fulfilled') {
      for (let plugin of activePlugins(p.value)) {
        mods.push(plugin);
      }
    } else {
      console.error(p.reason);
    }
  });

  // Load all federated component styles and log errors for any that do not
  (await Promise.allSettled(federatedStylePromises))
    .filter(({ status }) => status === 'rejected')
    .forEach(({ reason }) => {
      console.error(reason);
    });

  app.registerPluginModules(mods);

  await app.start();
}

window.addEventListener('load', main);
