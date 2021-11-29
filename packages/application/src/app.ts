// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { createRendermimePlugins } from '@jupyterlab/application/lib/mimerenderers';

import { LabStatus } from '@jupyterlab/application/lib/status';

import { PageConfig } from '@jupyterlab/coreutils';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { Throttler } from '@lumino/polling';

import { IRetroShell, RetroShell } from './shell';

/**
 * App is the main application class. It is instantiated once and shared.
 */
export class RetroApp extends JupyterFrontEnd<IRetroShell> {
  /**
   * Construct a new RetroApp object.
   *
   * @param options The instantiation options for an application.
   */
  constructor(options: RetroApp.IOptions = { shell: new RetroShell() }) {
    super({
      ...options,
      shell: options.shell ?? new RetroShell()
    });
    if (options.mimeExtensions) {
      for (const plugin of createRendermimePlugins(options.mimeExtensions)) {
        this.registerPlugin(plugin);
      }
    }
    this.restored.then(() => this._formatter.invoke());
  }

  /**
   * The name of the application.
   */
  readonly name = 'RetroLab';

  /**
   * A namespace/prefix plugins may use to denote their provenance.
   */
  readonly namespace = this.name;

  /**
   * The application busy and dirty status signals and flags.
   */
  readonly status = new LabStatus(this);

  /**
   * The version of the application.
   */

  readonly version = PageConfig.getOption('appVersion') ?? 'unknown';

  /**
   * The JupyterLab application paths dictionary.
   */
  get paths(): JupyterFrontEnd.IPaths {
    return {
      urls: {
        base: PageConfig.getOption('baseUrl'),
        notFound: PageConfig.getOption('notFoundUrl'),
        app: PageConfig.getOption('appUrl'),
        static: PageConfig.getOption('staticUrl'),
        settings: PageConfig.getOption('settingsUrl'),
        themes: PageConfig.getOption('themesUrl'),
        doc: PageConfig.getOption('docUrl'),
        translations: PageConfig.getOption('translationsApiUrl'),
        hubHost: PageConfig.getOption('hubHost') || undefined,
        hubPrefix: PageConfig.getOption('hubPrefix') || undefined,
        hubUser: PageConfig.getOption('hubUser') || undefined,
        hubServerName: PageConfig.getOption('hubServerName') || undefined
      },
      directories: {
        appSettings: PageConfig.getOption('appSettingsDir'),
        schemas: PageConfig.getOption('schemasDir'),
        static: PageConfig.getOption('staticDir'),
        templates: PageConfig.getOption('templatesDir'),
        themes: PageConfig.getOption('themesDir'),
        userSettings: PageConfig.getOption('userSettingsDir'),
        serverRoot: PageConfig.getOption('serverRoot'),
        workspaces: PageConfig.getOption('workspacesDir')
      }
    };
  }

  /**
   * Handle the DOM events for the application.
   *
   * @param event - The DOM event sent to the application.
   */
  handleEvent(event: Event): void {
    super.handleEvent(event);
    if (event.type === 'resize') {
      void this._formatter.invoke();
    }
  }

  /**
   * Register plugins from a plugin module.
   *
   * @param mod - The plugin module to register.
   */
  registerPluginModule(mod: RetroApp.IPluginModule): void {
    let data = mod.default;
    // Handle commonjs exports.
    if (!Object.prototype.hasOwnProperty.call(mod, '__esModule')) {
      data = mod as any;
    }
    if (!Array.isArray(data)) {
      data = [data];
    }
    data.forEach(item => {
      try {
        this.registerPlugin(item);
      } catch (error) {
        console.error(error);
      }
    });
  }

  /**
   * Register the plugins from multiple plugin modules.
   *
   * @param mods - The plugin modules to register.
   */
  registerPluginModules(mods: RetroApp.IPluginModule[]): void {
    mods.forEach(mod => {
      this.registerPluginModule(mod);
    });
  }

  private _formatter = new Throttler(() => {
    Private.setFormat(this);
  }, 250);
}

/**
 * A namespace for App statics.
 */
export namespace RetroApp {
  /**
   * The instantiation options for an App application.
   */
  export interface IOptions
    extends JupyterFrontEnd.IOptions<IRetroShell>,
      Partial<IInfo> {}

  /**
   * The information about a RetroLab application.
   */
  export interface IInfo {
    /**
     * The mime renderer extensions.
     */
    readonly mimeExtensions: IRenderMime.IExtensionModule[];
  }

  /**
   * The interface for a module that exports a plugin or plugins as
   * the default value.
   */
  export interface IPluginModule {
    /**
     * The default export.
     */
    default: JupyterFrontEndPlugin<any> | JupyterFrontEndPlugin<any>[];
  }
}

/**
 * A namespace for module-private functionality.
 */
namespace Private {
  /**
   * Media query for mobile devices.
   */
  const MOBILE_QUERY = 'only screen and (max-width: 760px)';

  /**
   * Sets the `format` of a Jupyter front-end application.
   *
   * @param app The front-end application whose format is set.
   */
  export function setFormat(app: RetroApp): void {
    app.format = window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop';
  }
}
