// Vendored from https://github.com/jupyterlab/jupyterlab/pull/9667
// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
/**
 * @packageDocumentation
 * @module filebrowser-extension
 */

import {
  ILayoutRestorer,
  ITreePathUpdater,
  IRouter,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import {
  Clipboard,
  MainAreaWidget,
  WidgetTracker,
  ICommandPalette,
  InputDialog,
  showErrorMessage,
  DOMUtils
} from '@jupyterlab/apputils';

import { PageConfig, PathExt, URLExt } from '@jupyterlab/coreutils';

import { IDocumentManager } from '@jupyterlab/docmanager';

import {
  FilterFileBrowserModel,
  FileBrowser,
  FileUploadStatus,
  IFileBrowserFactory
} from '@jupyterlab/filebrowser';

import { Launcher } from '@jupyterlab/launcher';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { Contents } from '@jupyterlab/services';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { IStateDB } from '@jupyterlab/statedb';

import { IStatusBar } from '@jupyterlab/statusbar';

import { ITranslator } from '@jupyterlab/translation';

import {
  addIcon,
  closeIcon,
  copyIcon,
  cutIcon,
  downloadIcon,
  editIcon,
  fileIcon,
  folderIcon,
  linkIcon,
  markdownIcon,
  newFolderIcon,
  pasteIcon,
  stopIcon,
  textEditorIcon
} from '@jupyterlab/ui-components';

import { IIterator, map, reduce, toArray, find } from '@lumino/algorithm';

import { CommandRegistry } from '@lumino/commands';

import { Message } from '@lumino/messaging';

import { Menu } from '@lumino/widgets';

/**
 * The command IDs used by the file browser plugin.
 */
namespace CommandIDs {
  export const copy = 'filebrowser:copy';

  export const copyDownloadLink = 'filebrowser:copy-download-link';

  // For main browser only.
  export const createLauncher = 'filebrowser:create-main-launcher';

  export const cut = 'filebrowser:cut';

  export const del = 'filebrowser:delete';

  export const download = 'filebrowser:download';

  export const duplicate = 'filebrowser:duplicate';

  // For main browser only.
  export const hideBrowser = 'filebrowser:hide-main';

  export const goToPath = 'filebrowser:go-to-path';

  export const openPath = 'filebrowser:open-path';

  export const open = 'filebrowser:open';

  export const openBrowserTab = 'filebrowser:open-browser-tab';

  export const paste = 'filebrowser:paste';

  export const createNewDirectory = 'filebrowser:create-new-directory';

  export const createNewFile = 'filebrowser:create-new-file';

  export const createNewMarkdownFile = 'filebrowser:create-new-markdown-file';

  export const rename = 'filebrowser:rename';

  // For main browser only.
  export const share = 'filebrowser:share-main';

  // For main browser only.
  export const copyPath = 'filebrowser:copy-path';

  export const showBrowser = 'filebrowser:activate';

  export const shutdown = 'filebrowser:shutdown';

  // For main browser only.
  export const toggleBrowser = 'filebrowser:toggle-main';

  export const toggleNavigateToCurrentDirectory =
    'filebrowser:toggle-navigate-to-current-directory';

  export const toggleLastModified = 'filebrowser:toggle-last-modified';

  export const search = 'filebrowser:search';
}

/**
 * The file browser namespace token.
 */
const namespace = 'filebrowser';

/**
 * The default file browser extension.
 */
const browser: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/filebrowser-extension:browser',
  requires: [IFileBrowserFactory, ITranslator],
  optional: [
    ILayoutRestorer,
    ISettingRegistry,
    ITreePathUpdater,
    ICommandPalette,
    IMainMenu
  ],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    factory: IFileBrowserFactory,
    translator: ITranslator,
    restorer: ILayoutRestorer | null,
    settingRegistry: ISettingRegistry | null,
    treePathUpdater: ITreePathUpdater | null,
    commandPalette: ICommandPalette | null,
    mainMenu: IMainMenu | null
  ): void => {
    const trans = translator.load('jupyterlab');
    const browser = factory.defaultBrowser;

    // Let the application restorer track the primary file browser (that is
    // automatically created) for restoration of application state (e.g. setting
    // the file browser as the current side bar widget).
    //
    // All other file browsers created by using the factory function are
    // responsible for their own restoration behavior, if any.
    if (restorer) {
      restorer.add(browser, namespace);
    }

    addCommands(
      app,
      factory,
      translator,
      settingRegistry,
      commandPalette,
      mainMenu
    );

    browser.title.icon = folderIcon;
    // Show the current file browser shortcut in its title.
    const updateBrowserTitle = () => {
      const binding = find(
        app.commands.keyBindings,
        b => b.command === CommandIDs.toggleBrowser
      );
      if (binding) {
        const ks = CommandRegistry.formatKeystroke(binding.keys.join(' '));
        browser.title.caption = trans.__('File Browser (%1)', ks);
      } else {
        browser.title.caption = trans.__('File Browser');
      }
    };
    updateBrowserTitle();
    app.commands.keyBindingChanged.connect(() => {
      updateBrowserTitle();
    });

    void Promise.all([app.restored, browser.model.restored]).then(() => {
      if (treePathUpdater) {
        browser.model.pathChanged.connect((sender, args) => {
          treePathUpdater(args.newValue);
        });
      }

      let navigateToCurrentDirectory = false;
      let useFuzzyFilter = true;

      if (settingRegistry) {
        void settingRegistry
          .load('@jupyterlab/filebrowser-extension:browser')
          .then(settings => {
            settings.changed.connect(settings => {
              navigateToCurrentDirectory = settings.get(
                'navigateToCurrentDirectory'
              ).composite as boolean;
              browser.navigateToCurrentDirectory = navigateToCurrentDirectory;
            });
            navigateToCurrentDirectory = settings.get(
              'navigateToCurrentDirectory'
            ).composite as boolean;
            browser.navigateToCurrentDirectory = navigateToCurrentDirectory;
            settings.changed.connect(settings => {
              useFuzzyFilter = settings.get('useFuzzyFilter')
                .composite as boolean;
              browser.useFuzzyFilter = useFuzzyFilter;
            });
            useFuzzyFilter = settings.get('useFuzzyFilter')
              .composite as boolean;
            browser.useFuzzyFilter = useFuzzyFilter;
          });
      }
    });
  }
};

/**
 * The default file browser factory provider.
 */
const factory: JupyterFrontEndPlugin<IFileBrowserFactory> = {
  id: '@jupyterlab/filebrowser-extension:factory',
  provides: IFileBrowserFactory,
  requires: [IDocumentManager, ITranslator],
  optional: [IStateDB, IRouter, JupyterFrontEnd.ITreeResolver],
  activate: async (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    translator: ITranslator,
    state: IStateDB | null,
    router: IRouter | null,
    tree: JupyterFrontEnd.ITreeResolver | null
  ): Promise<IFileBrowserFactory> => {
    const { commands } = app;
    const tracker = new WidgetTracker<FileBrowser>({ namespace });
    const createFileBrowser = (
      id: string,
      options: IFileBrowserFactory.IOptions = {}
    ) => {
      const model = new FilterFileBrowserModel({
        translator: translator,
        auto: options.auto ?? true,
        manager: docManager,
        driveName: options.driveName || '',
        refreshInterval: options.refreshInterval,
        state:
          options.state === null
            ? undefined
            : options.state || state || undefined
      });
      const restore = options.restore;
      const widget = new FileBrowser({ id, model, restore, translator });

      // Track the newly created file browser.
      void tracker.add(widget);

      return widget;
    };

    // Manually restore and load the default file browser.
    const defaultBrowser = createFileBrowser('filebrowser', {
      auto: false,
      restore: false
    });
    void Private.restoreBrowser(defaultBrowser, commands, router, tree);

    return { createFileBrowser, defaultBrowser, tracker };
  }
};

/**
 * The default file browser share-file plugin
 *
 * This extension adds a "Copy Shareable Link" command that generates a copy-
 * pastable URL. This url can be used to open a particular file in JupyterLab,
 * handy for emailing links or bookmarking for reference.
 *
 * If you need to change how this link is generated (for instance, to copy a
 * /user-redirect URL for JupyterHub), disable this plugin and replace it
 * with another implementation.
 */
const shareFile: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/filebrowser-extension:share-file',
  requires: [IFileBrowserFactory, ITranslator],
  autoStart: true,
  activate: (
    app: JupyterFrontEnd,
    factory: IFileBrowserFactory,
    translator: ITranslator
  ): void => {
    const trans = translator.load('jupyterlab');
    const { commands } = app;
    const { tracker } = factory;

    commands.addCommand(CommandIDs.share, {
      execute: () => {
        const widget = tracker.currentWidget;
        const model = widget?.selectedItems().next();
        if (!model) {
          return;
        }
        const path = encodeURI(model.path);

        Clipboard.copyToSystem(
          URLExt.normalize(
            PageConfig.getUrl({
              mode: 'single-document',
              workspace: PageConfig.defaultWorkspace,
              treePath: path
            })
          )
        );
      },
      isVisible: () =>
        !!tracker.currentWidget &&
        toArray(tracker.currentWidget.selectedItems()).length === 1,
      icon: linkIcon.bindprops({ stylesheet: 'menuItem' }),
      label: trans.__('Copy Shareable Link')
    });
  }
};

/**
 * A plugin providing file upload status.
 */
export const fileUploadStatus: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/filebrowser-extension:file-upload-status',
  autoStart: true,
  requires: [IFileBrowserFactory, ITranslator],
  optional: [IStatusBar],
  activate: (
    app: JupyterFrontEnd,
    browser: IFileBrowserFactory,
    translator: ITranslator,
    statusBar: IStatusBar | null
  ) => {
    if (!statusBar) {
      // Automatically disable if statusbar missing
      return;
    }
    const item = new FileUploadStatus({
      tracker: browser.tracker,
      translator
    });

    statusBar.registerStatusItem(
      '@jupyterlab/filebrowser-extension:file-upload-status',
      {
        item,
        align: 'middle',
        isActive: () => {
          return !!item.model && item.model.items.length > 0;
        },
        activeStateChanged: item.model.stateChanged
      }
    );
  }
};

/**
 * Add the main file browser commands to the application's command registry.
 */
function addCommands(
  app: JupyterFrontEnd,
  factory: IFileBrowserFactory,
  translator: ITranslator,
  settingRegistry: ISettingRegistry | null,
  commandPalette: ICommandPalette | null,
  mainMenu: IMainMenu | null
): void {
  const trans = translator.load('jupyterlab');
  const { docRegistry: registry, commands } = app;
  const { defaultBrowser: browser, tracker } = factory;

  commands.addCommand(CommandIDs.del, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.delete();
      }
    },
    icon: closeIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Delete'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copy, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.copy();
      }
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Copy'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.cut, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.cut();
      }
    },
    icon: cutIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Cut')
  });

  commands.addCommand(CommandIDs.download, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.download();
      }
    },
    icon: downloadIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Download')
  });

  commands.addCommand(CommandIDs.duplicate, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.duplicate();
      }
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Duplicate')
  });

  commands.addCommand(CommandIDs.goToPath, {
    execute: async args => {
      const path = (args.path as string) || '';
      const showBrowser = !(args?.dontShowBrowser ?? false);
      try {
        const item = await Private.navigateToPath(path, factory, translator);
        if (item.type !== 'directory' && showBrowser) {
          const browserForPath = Private.getBrowserForPath(path, factory);
          if (browserForPath) {
            browserForPath.clearSelectedItems();
            const parts = path.split('/');
            const name = parts[parts.length - 1];
            if (name) {
              await browserForPath.selectItemByName(name);
            }
          }
        }
      } catch (reason) {
        console.warn(`${CommandIDs.goToPath} failed to go to: ${path}`, reason);
      }
      if (showBrowser) {
        return commands.execute(CommandIDs.showBrowser, { path });
      }
    }
  });

  commands.addCommand(CommandIDs.openPath, {
    label: args =>
      args.path ? trans.__('Open %1', args.path) : trans.__('Open from Path…'),
    caption: args =>
      args.path ? trans.__('Open %1', args.path) : trans.__('Open from path'),
    execute: async args => {
      let path: string | undefined;
      if (args?.path) {
        path = args.path as string;
      } else {
        path =
          (
            await InputDialog.getText({
              label: trans.__('Path'),
              placeholder: '/path/relative/to/jlab/root',
              title: trans.__('Open Path'),
              okLabel: trans.__('Open')
            })
          ).value ?? undefined;
      }
      if (!path) {
        return;
      }
      try {
        const trailingSlash = path !== '/' && path.endsWith('/');
        if (trailingSlash) {
          // The normal contents service errors on paths ending in slash
          path = path.slice(0, path.length - 1);
        }
        const browserForPath = Private.getBrowserForPath(path, factory)!;
        const { services } = browserForPath.model.manager;
        const item = await services.contents.get(path, {
          content: false
        });
        if (trailingSlash && item.type !== 'directory') {
          throw new Error(`Path ${path}/ is not a directory`);
        }
        await commands.execute(CommandIDs.goToPath, {
          path,
          dontShowBrowser: args.dontShowBrowser
        });
        if (item.type === 'directory') {
          return;
        }
        return commands.execute('docmanager:open', { path });
      } catch (reason) {
        if (reason.response && reason.response.status === 404) {
          reason.message = trans.__('Could not find path: %1', path);
        }
        return showErrorMessage(trans.__('Cannot open'), reason);
      }
    }
  });
  // Add the openPath command to the command palette
  if (commandPalette) {
    commandPalette.addItem({
      command: CommandIDs.openPath,
      category: trans.__('File Operations')
    });
  }

  commands.addCommand(CommandIDs.open, {
    execute: args => {
      const factory = (args['factory'] as string) || void 0;
      const widget = tracker.currentWidget;

      if (!widget) {
        return;
      }

      const { contents } = widget.model.manager.services;
      return Promise.all(
        toArray(
          map(widget.selectedItems(), item => {
            if (item.type === 'directory') {
              const localPath = contents.localPath(item.path);
              return widget.model.cd(`/${localPath}`);
            }

            return commands.execute('docmanager:open', {
              factory: factory,
              path: item.path
            });
          })
        )
      );
    },
    icon: args => {
      const factory = (args['factory'] as string) || void 0;
      if (factory) {
        // if an explicit factory is passed...
        const ft = registry.getFileType(factory);
        // ...set an icon if the factory name corresponds to a file type name...
        // ...or leave the icon blank
        return ft?.icon?.bindprops({ stylesheet: 'menuItem' });
      } else {
        return folderIcon.bindprops({ stylesheet: 'menuItem' });
      }
    },
    // FIXME-TRANS: Is this localizable?
    label: args =>
      (args['label'] || args['factory'] || trans.__('Open')) as string,
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.openBrowserTab, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (!widget) {
        return;
      }

      return Promise.all(
        toArray(
          map(widget.selectedItems(), item => {
            return commands.execute('docmanager:open-browser-tab', {
              path: item.path
            });
          })
        )
      );
    },
    icon: addIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Open in New Browser Tab'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copyDownloadLink, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }

      return widget.model.manager.services.contents
        .getDownloadUrl(widget.selectedItems().next()!.path)
        .then(url => {
          Clipboard.copyToSystem(url);
        });
    },
    icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Copy Download Link'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.paste, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.paste();
      }
    },
    icon: pasteIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Paste'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.createNewDirectory, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.createNewDirectory();
      }
    },
    icon: newFolderIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('New Folder')
  });

  commands.addCommand(CommandIDs.createNewFile, {
    execute: () => {
      const {
        model: { path }
      } = browser;
      void commands.execute('docmanager:new-untitled', {
        path,
        type: 'file',
        ext: 'txt'
      });
    },
    icon: textEditorIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('New File')
  });

  commands.addCommand(CommandIDs.createNewMarkdownFile, {
    execute: () => {
      const {
        model: { path }
      } = browser;
      void commands.execute('docmanager:new-untitled', {
        path,
        type: 'file',
        ext: 'md'
      });
    },
    icon: markdownIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('New Markdown File')
  });

  commands.addCommand(CommandIDs.rename, {
    execute: args => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.rename();
      }
    },
    icon: editIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Rename'),
    mnemonic: 0
  });

  commands.addCommand(CommandIDs.copyPath, {
    execute: () => {
      const widget = tracker.currentWidget;
      if (!widget) {
        return;
      }
      const item = widget.selectedItems().next();
      if (!item) {
        return;
      }

      Clipboard.copyToSystem(item.path);
    },
    isVisible: () =>
      !!tracker.currentWidget &&
      tracker.currentWidget.selectedItems().next !== undefined,
    icon: fileIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Copy Path')
  });

  commands.addCommand(CommandIDs.shutdown, {
    execute: () => {
      const widget = tracker.currentWidget;

      if (widget) {
        return widget.shutdownKernels();
      }
    },
    icon: stopIcon.bindprops({ stylesheet: 'menuItem' }),
    label: trans.__('Shut Down Kernel')
  });

  commands.addCommand(CommandIDs.toggleBrowser, {
    execute: () => {
      if (browser.isHidden) {
        return commands.execute(CommandIDs.showBrowser, void 0);
      }

      return commands.execute(CommandIDs.hideBrowser, void 0);
    }
  });

  commands.addCommand(CommandIDs.createLauncher, {
    label: trans.__('New Launcher'),
    execute: () => Private.createLauncher(commands, browser)
  });

  if (settingRegistry) {
    commands.addCommand(CommandIDs.toggleNavigateToCurrentDirectory, {
      label: trans.__('Show Active File in File Browser'),
      isToggled: () => browser.navigateToCurrentDirectory,
      execute: () => {
        const value = !browser.navigateToCurrentDirectory;
        const key = 'navigateToCurrentDirectory';
        return settingRegistry
          .set('@jupyterlab/filebrowser-extension:browser', key, value)
          .catch((reason: Error) => {
            console.error('Failed to set navigateToCurrentDirectory setting');
          });
      }
    });
  }

  commands.addCommand(CommandIDs.toggleLastModified, {
    label: trans.__('Toggle Last Modified Column'),
    execute: () => {
      const header = DOMUtils.findElement(document.body, 'jp-id-modified');
      const column = DOMUtils.findElements(
        document.body,
        'jp-DirListing-itemModified'
      );
      if (header.classList.contains('jp-LastModified-hidden')) {
        header.classList.remove('jp-LastModified-hidden');
        for (let i = 0; i < column.length; i++) {
          column[i].classList.remove('jp-LastModified-hidden');
        }
      } else {
        header.classList.add('jp-LastModified-hidden');
        for (let i = 0; i < column.length; i++) {
          column[i].classList.add('jp-LastModified-hidden');
        }
      }
    }
  });

  commands.addCommand(CommandIDs.search, {
    label: trans.__('Search on File Names'),
    execute: () => alert('search')
  });

  if (mainMenu) {
    mainMenu.settingsMenu.addGroup(
      [{ command: CommandIDs.toggleNavigateToCurrentDirectory }],
      5
    );
  }

  if (commandPalette) {
    commandPalette.addItem({
      command: CommandIDs.toggleNavigateToCurrentDirectory,
      category: trans.__('File Operations')
    });
  }

  /**
   * A menu widget that dynamically populates with different widget factories
   * based on current filebrowser selection.
   */
  class OpenWithMenu extends Menu {
    protected onBeforeAttach(msg: Message): void {
      // clear the current menu items
      this.clearItems();

      // get the widget factories that could be used to open all of the items
      // in the current filebrowser selection
      const factories = tracker.currentWidget
        ? OpenWithMenu._intersection(
            map(tracker.currentWidget.selectedItems(), i => {
              return OpenWithMenu._getFactories(i);
            })
          )
        : undefined;

      if (factories) {
        // make new menu items from the widget factories
        factories.forEach(factory => {
          this.addItem({
            args: { factory: factory },
            command: CommandIDs.open
          });
        });
      }

      super.onBeforeAttach(msg);
    }

    static _getFactories(item: Contents.IModel): Array<string> {
      const factories = registry
        .preferredWidgetFactories(item.path)
        .map(f => f.name);
      const notebookFactory = registry.getWidgetFactory('notebook')?.name;
      if (
        notebookFactory &&
        item.type === 'notebook' &&
        factories.indexOf(notebookFactory) === -1
      ) {
        factories.unshift(notebookFactory);
      }

      return factories;
    }

    static _intersection<T>(iter: IIterator<Array<T>>): Set<T> | void {
      // pop the first element of iter
      const first = iter.next();
      // first will be undefined if iter is empty
      if (!first) {
        return;
      }

      // "initialize" the intersection from first
      const isect = new Set(first);
      // reduce over the remaining elements of iter
      return reduce(
        iter,
        (isect, subarr) => {
          // filter out all elements not present in both isect and subarr,
          // accumulate result in new set
          return new Set(subarr.filter(x => isect.has(x)));
        },
        isect
      );
    }
  }

  // matches anywhere on filebrowser
  const selectorContent = '.jp-DirListing-content';
  // matches all filebrowser items
  const selectorItem = '.jp-DirListing-item[data-isdir]';
  // matches only non-directory items
  const selectorNotDir = '.jp-DirListing-item[data-isdir="false"]';

  // If the user did not click on any file, we still want to show paste and new folder,
  // so target the content rather than an item.
  app.contextMenu.addItem({
    command: CommandIDs.createNewDirectory,
    selector: selectorContent,
    rank: 1
  });

  app.contextMenu.addItem({
    command: CommandIDs.createNewFile,
    selector: selectorContent,
    rank: 2
  });

  app.contextMenu.addItem({
    command: CommandIDs.createNewMarkdownFile,
    selector: selectorContent,
    rank: 3
  });

  app.contextMenu.addItem({
    command: CommandIDs.paste,
    selector: selectorContent,
    rank: 4
  });

  app.contextMenu.addItem({
    command: CommandIDs.open,
    selector: selectorItem,
    rank: 1
  });

  const openWith = new OpenWithMenu({ commands });
  openWith.title.label = trans.__('Open With');
  app.contextMenu.addItem({
    type: 'submenu',
    submenu: openWith,
    selector: selectorNotDir,
    rank: 2
  });

  app.contextMenu.addItem({
    command: CommandIDs.openBrowserTab,
    selector: selectorNotDir,
    rank: 3
  });

  app.contextMenu.addItem({
    command: CommandIDs.rename,
    selector: selectorItem,
    rank: 4
  });
  app.contextMenu.addItem({
    command: CommandIDs.del,
    selector: selectorItem,
    rank: 5
  });
  app.contextMenu.addItem({
    command: CommandIDs.cut,
    selector: selectorItem,
    rank: 6
  });

  app.contextMenu.addItem({
    command: CommandIDs.copy,
    selector: selectorNotDir,
    rank: 7
  });

  app.contextMenu.addItem({
    command: CommandIDs.duplicate,
    selector: selectorNotDir,
    rank: 8
  });
  app.contextMenu.addItem({
    command: CommandIDs.download,
    selector: selectorNotDir,
    rank: 9
  });
  app.contextMenu.addItem({
    command: CommandIDs.shutdown,
    selector: selectorNotDir,
    rank: 10
  });

  app.contextMenu.addItem({
    command: CommandIDs.share,
    selector: selectorItem,
    rank: 11
  });
  app.contextMenu.addItem({
    command: CommandIDs.copyPath,
    selector: selectorItem,
    rank: 12
  });
  app.contextMenu.addItem({
    command: CommandIDs.copyDownloadLink,
    selector: selectorNotDir,
    rank: 13
  });
  app.contextMenu.addItem({
    command: CommandIDs.toggleLastModified,
    selector: '.jp-DirListing-header',
    rank: 14
  });
}

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * Create a launcher for a given filebrowser widget.
   */
  export function createLauncher(
    commands: CommandRegistry,
    browser: FileBrowser
  ): Promise<MainAreaWidget<Launcher>> {
    const { model } = browser;

    return commands
      .execute('launcher:create', { cwd: model.path })
      .then((launcher: MainAreaWidget<Launcher>) => {
        model.pathChanged.connect(() => {
          if (launcher.content) {
            launcher.content.cwd = model.path;
          }
        }, launcher);
        return launcher;
      });
  }

  /**
   * Get browser object given file path.
   */
  export function getBrowserForPath(
    path: string,
    factory: IFileBrowserFactory
  ): FileBrowser | undefined {
    const { defaultBrowser: browser, tracker } = factory;
    const driveName = browser.model.manager.services.contents.driveName(path);

    if (driveName) {
      const browserForPath = tracker.find(
        _path => _path.model.driveName === driveName
      );

      if (!browserForPath) {
        // warn that no filebrowser could be found for this driveName
        console.warn(
          `${CommandIDs.goToPath} failed to find filebrowser for path: ${path}`
        );
        return;
      }

      return browserForPath;
    }

    // if driveName is empty, assume the main filebrowser
    return browser;
  }

  /**
   * Navigate to a path or the path containing a file.
   */
  export async function navigateToPath(
    path: string,
    factory: IFileBrowserFactory,
    translator: ITranslator
  ): Promise<Contents.IModel> {
    const trans = translator.load('jupyterlab');
    const browserForPath = Private.getBrowserForPath(path, factory);
    if (!browserForPath) {
      throw new Error(trans.__('No browser for path'));
    }
    const { services } = browserForPath.model.manager;
    const localPath = services.contents.localPath(path);

    await services.ready;
    const item = await services.contents.get(path, { content: false });
    const { model } = browserForPath;
    await model.restored;
    if (item.type === 'directory') {
      await model.cd(`/${localPath}`);
    } else {
      await model.cd(`/${PathExt.dirname(localPath)}`);
    }
    return item;
  }

  /**
   * Restores file browser state and overrides state if tree resolver resolves.
   */
  export async function restoreBrowser(
    browser: FileBrowser,
    commands: CommandRegistry,
    router: IRouter | null,
    tree: JupyterFrontEnd.ITreeResolver | null
  ): Promise<void> {
    const restoring = 'jp-mod-restoring';

    browser.addClass(restoring);

    if (!router) {
      await browser.model.restore(browser.id);
      await browser.model.refresh();
      browser.removeClass(restoring);
      return;
    }

    const listener = async () => {
      router.routed.disconnect(listener);

      const paths = await tree?.paths;
      if (paths?.file || paths?.browser) {
        // Restore the model without populating it.
        await browser.model.restore(browser.id, false);
        if (paths.file) {
          await commands.execute(CommandIDs.openPath, {
            path: paths.file,
            dontShowBrowser: true
          });
        }
        if (paths.browser) {
          await commands.execute(CommandIDs.openPath, {
            path: paths.browser,
            dontShowBrowser: true
          });
        }
      } else {
        await browser.model.restore(browser.id);
        await browser.model.refresh();
      }
      browser.removeClass(restoring);
    };
    router.routed.connect(listener);
  }
}

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [
  factory,
  browser,
  shareFile,
  fileUploadStatus
];
export default plugins;
