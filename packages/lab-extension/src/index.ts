// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabShell,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ICommandPalette, ToolbarButton } from '@jupyterlab/apputils';

import { PageConfig } from '@jupyterlab/coreutils';

import { DocumentRegistry } from '@jupyterlab/docregistry';

import { IMainMenu } from '@jupyterlab/mainmenu';

import {
  INotebookModel,
  INotebookTracker,
  NotebookPanel
} from '@jupyterlab/notebook';

import { jupyterIcon } from '@jupyterlab/ui-components';

import { CommandRegistry } from '@lumino/commands';

import { IDisposable } from '@lumino/disposable';

/**
 * The command IDs used by the application plugin.
 */
namespace CommandIDs {
  /**
   * Toggle Top Bar visibility
   */
  export const openClassic = 'retrolab:open';
}

/**
 * A notebook widget extension that adds a jupyterlab classic button to the toolbar.
 */
class ClassicButton
  implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
  /**
   * Instantiate a new ClassicButton.
   * @param commands The command registry.
   */
  constructor(commands: CommandRegistry) {
    this._commands = commands;
  }

  /**
   * Create a new extension object.
   */
  createNew(panel: NotebookPanel): IDisposable {
    const button = new ToolbarButton({
      tooltip: 'Open with RetroLab',
      icon: jupyterIcon,
      onClick: () => {
        this._commands.execute(CommandIDs.openClassic);
      }
    });
    panel.toolbar.insertAfter('cellType', 'jupyterlabClassic', button);
    return button;
  }

  private _commands: CommandRegistry;
}

/**
 * A plugin for the checkpoint indicator
 */
const openClassic: JupyterFrontEndPlugin<void> = {
  id: '@retrolab/lab-extension:open-classic',
  autoStart: true,
  optional: [INotebookTracker, ICommandPalette, IMainMenu, ILabShell],
  activate: (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker | null,
    palette: ICommandPalette | null,
    menu: IMainMenu | null,
    labShell: ILabShell | null
  ) => {
    // TODO: do not activate if already in a IClassicShell?
    if (!notebookTracker || !labShell) {
      // to prevent showing the toolbar button in RetroLab
      return;
    }

    const { commands, docRegistry, shell } = app;
    const baseUrl = PageConfig.getBaseUrl();

    const isEnabled = () => {
      return (
        notebookTracker.currentWidget !== null &&
        notebookTracker.currentWidget === shell.currentWidget
      );
    };

    commands.addCommand(CommandIDs.openClassic, {
      label: 'Open in RetroLab',
      execute: () => {
        const current = notebookTracker.currentWidget;
        if (!current) {
          return;
        }
        const { context } = current;
        window.open(`${baseUrl}classic/notebooks/${context.path}`);
      },
      isEnabled
    });

    if (palette) {
      palette.addItem({ command: CommandIDs.openClassic, category: 'Other' });
    }

    if (menu) {
      menu.viewMenu.addGroup([{ command: CommandIDs.openClassic }], 1);
    }

    const classicButton = new ClassicButton(commands);
    docRegistry.addWidgetExtension('Notebook', classicButton);
  }
};

/**
 * Export the plugins as default.
 */
const plugins: JupyterFrontEndPlugin<any>[] = [openClassic];

export default plugins;
