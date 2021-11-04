// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { showDialog, Dialog } from '@jupyterlab/apputils';

import { IMainMenu } from '@jupyterlab/mainmenu';

import { ITranslator } from '@jupyterlab/translation';

import { retroIcon } from '@retrolab/ui-components';

import * as React from 'react';

/**
 * A list of resources to show in the help menu.
 */
const RESOURCES = [
  {
    text: 'About Jupyter',
    url: 'https://jupyter.org'
  },
  {
    text: 'Markdown Reference',
    url: 'https://commonmark.org/help/'
  }
];

/**
 * The command IDs used by the help plugin.
 */
namespace CommandIDs {
  export const open = 'help:open';

  export const shortcuts = 'help:shortcuts';

  export const about = 'help:about';
}

/**
 * The help plugin.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@retrolab/help-extension:plugin',
  autoStart: true,
  requires: [ITranslator],
  optional: [IMainMenu],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    menu: IMainMenu | null
  ): void => {
    const { commands } = app;
    const trans = translator.load('retrolab');

    commands.addCommand(CommandIDs.open, {
      label: args => args['text'] as string,
      execute: args => {
        const url = args['url'] as string;
        window.open(url);
      }
    });

    commands.addCommand(CommandIDs.shortcuts, {
      label: trans.__('Keyboard Shortcuts'),
      execute: () => {
        const title = (
          <span className="jp-AboutRetro-about-header">
            <div className="jp-AboutRetro-about-header-info">
              {trans.__('Keyboard Shortcuts')}
            </div>
          </span>
        );

        const body = (
          <table className="jp-AboutRetro-shortcuts">
            <thead>
              <tr>
                <th>{trans.__('Name')}</th>
                <th>{trans.__('Shortcut')}</th>
              </tr>
            </thead>
            <tbody>
              {commands.keyBindings
                .filter(binding => commands.isEnabled(binding.command))
                .map((binding, i) => (
                  <tr key={i}>
                    <td>{commands.label(binding.command)}</td>
                    <td>
                      <pre>{binding.keys.join(', ')}</pre>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        );

        return showDialog({
          title,
          body,
          buttons: [
            Dialog.createButton({
              label: trans.__('Dismiss'),
              className:
                'jp-AboutRetro-about-button jp-mod-reject jp-mod-styled'
            })
          ]
        });
      }
    });

    commands.addCommand(CommandIDs.about, {
      label: trans.__('About %1', app.name),
      execute: () => {
        const title = (
          <>
            <span className="jp-AboutRetro-header">
              <retroIcon.react height="256px" width="auto" />
            </span>
          </>
        );

        const retroNotebookURL = 'https://github.com/jupyterlab/retrolab';
        const linkLabel = trans.__('RetroLab on GitHub');
        const externalLinks = (
          <span>
            <a
              href={retroNotebookURL}
              target="_blank"
              rel="noopener noreferrer"
              className="jp-Button-flat jp-AboutRetro-about-externalLinks"
            >
              {linkLabel}
            </a>
          </span>
        );
        const version = trans.__('Version: %1', app.version);
        const body = (
          <>
            <span className="jp-AboutRetro-body">{version}</span>
            <div>{externalLinks}</div>
          </>
        );

        const dialog = new Dialog({
          title,
          body,
          buttons: [
            Dialog.createButton({
              label: trans.__('Dismiss'),
              className:
                'jp-AboutRetro-about-button jp-mod-reject jp-mod-styled'
            })
          ]
        });
        dialog.addClass('jp-AboutRetro');
        void dialog.launch();
      }
    });

    const resourcesGroup = RESOURCES.map(args => ({
      args,
      command: CommandIDs.open
    }));

    if (menu) {
      menu.helpMenu.addGroup([{ command: CommandIDs.about }]);
      menu.helpMenu.addGroup([{ command: CommandIDs.shortcuts }]);
      menu.helpMenu.addGroup(resourcesGroup);
    }
  }
};

export default plugin;
