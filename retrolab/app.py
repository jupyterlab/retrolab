import os
from os.path import join as pjoin

from jupyter_core.application import base_aliases, base_flags
from jupyter_server.base.handlers import JupyterHandler
from jupyter_server.extension.handler import (
    ExtensionHandlerMixin,
    ExtensionHandlerJinjaMixin,
)
from jupyter_server.utils import url_path_join as ujoin
from jupyterlab.commands import get_app_dir, get_user_settings_dir, get_workspaces_dir
from jupyterlab_server import LabServerApp
from jupyterlab_server.config import get_page_config, recursive_update, LabConfig
from jupyterlab_server.handlers import is_url, _camelCase
from nbclassic.shim import NBClassicConfigShimMixin
from tornado import web
from traitlets import Bool

from ._version import __version__

HERE = os.path.dirname(__file__)

app_dir = get_app_dir()
version = __version__


class RetroHandler(ExtensionHandlerJinjaMixin, ExtensionHandlerMixin, JupyterHandler):
    def get_page_config(self):
        config = LabConfig()
        app = self.extensionapp
        base_url = self.settings.get("base_url")

        page_config = {
            "appVersion": version,
            "baseUrl": self.base_url,
            "terminalsAvailable": self.settings.get('terminals_available', False),
            "token": self.settings["token"],
            "fullStaticUrl": ujoin(self.base_url, "static", self.name),
            "frontendUrl": ujoin(self.base_url, "retro/"),
            "collaborative": app.collaborative,
        }

        mathjax_config = self.settings.get("mathjax_config", "TeX-AMS_HTML-full,Safe")
        # TODO Remove CDN usage.
        mathjax_url = self.settings.get(
            "mathjax_url",
            "https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js",
        )
        page_config.setdefault("mathjaxConfig", mathjax_config)
        page_config.setdefault("fullMathjaxUrl", mathjax_url)

        # Put all our config in page_config
        for name in config.trait_names():
            page_config[_camelCase(name)] = getattr(app, name)

        # Add full versions of all the urls
        for name in config.trait_names():
            if not name.endswith("_url"):
                continue
            full_name = _camelCase("full_" + name)
            full_url = getattr(app, name)
            if not is_url(full_url):
                # Relative URL will be prefixed with base_url
                full_url = ujoin(base_url, full_url)
            page_config[full_name] = full_url

        labextensions_path = app.extra_labextensions_path + app.labextensions_path
        recursive_update(
            page_config,
            get_page_config(
                labextensions_path,
                logger=self.log,
            ),
        )
        return page_config


class RetroTreeHandler(RetroHandler):
    @web.authenticated
    def get(self, path=None):
        tpl = self.render_template("tree.html", page_config=self.get_page_config())
        return self.write(tpl)


class RetroTerminalHandler(RetroHandler):
    @web.authenticated
    def get(self, path=None):
        tpl = self.render_template("terminals.html", page_config=self.get_page_config())
        return self.write(tpl)


class RetroFileHandler(RetroHandler):
    @web.authenticated
    def get(self, path=None):
        tpl = self.render_template("edit.html", page_config=self.get_page_config())
        return self.write(tpl)


class RetroNotebookHandler(RetroHandler):
    @web.authenticated
    def get(self, path=None):
        tpl = self.render_template("notebooks.html", page_config=self.get_page_config())
        return self.write(tpl)


class RetroApp(NBClassicConfigShimMixin, LabServerApp):
    name = "retro"
    app_name = "RetroLab"
    description = "RetroLab - A JupyterLab Distribution with a retro look and feel"
    app_version = version
    extension_url = "/retro"
    default_url = "/retro/tree"
    file_url_prefix = "/retro/notebooks"
    load_other_extensions = True
    app_dir = app_dir
    app_settings_dir = pjoin(app_dir, "settings")
    schemas_dir = pjoin(app_dir, "schemas")
    themes_dir = pjoin(app_dir, "themes")
    user_settings_dir = get_user_settings_dir()
    workspaces_dir = get_workspaces_dir()
    subcommands = {}
    collaborative = Bool(
        False, config=True, help="Whether to enable collaborative mode."
    )

    aliases = dict(base_aliases)
    flags = dict(base_flags)
    flags["collaborative"] = (
        {"RetroApp": {"collaborative": True}},
        "Whether to enable collaborative mode.",
    )

    def initialize_handlers(self):
        self.handlers.append(
            (
                rf"/{self.file_url_prefix}/((?!.*\.ipynb($|\?)).*)",
                web.RedirectHandler,
                {"url": "/retro/edit/{0}"}
            )
        )
        self.handlers.append(("/retro/tree(.*)", RetroTreeHandler))
        self.handlers.append(("/retro/notebooks(.*)", RetroNotebookHandler))
        self.handlers.append(("/retro/edit(.*)", RetroFileHandler))
        self.handlers.append(("/retro/terminals/(.*)", RetroTerminalHandler))
        super().initialize_handlers()

    def initialize_templates(self):
        super().initialize_templates()
        self.static_dir = os.path.join(HERE, "static")
        self.templates_dir = os.path.join(HERE, "templates")
        self.static_paths = [self.static_dir]
        self.template_paths = [self.templates_dir]

    def initialize_settings(self):
        super().initialize_settings()

    def initialize(self, argv=None):
        """Subclass because the ExtensionApp.initialize() method does not take arguments"""
        super().initialize()


main = launch_new_instance = RetroApp.launch_instance

if __name__ == "__main__":
    main()
