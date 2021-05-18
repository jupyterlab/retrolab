from ._version import __version__
from .app import ClassicApp
from .serverextension import load_jupyter_server_extension


def _jupyter_server_extension_paths():
    return [
        {
            'module': 'retrolab'
        }
    ]


def _jupyter_server_extension_points():
    return [{"module": "retrolab", "app": ClassicApp}]


def _jupyter_labextension_paths():
    return [{
        'src': 'labextension',
        'dest': '@retrolab/lab-extension'
    }]