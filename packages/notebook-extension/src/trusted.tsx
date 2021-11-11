import { ReactWidget } from '@jupyterlab/apputils';

import { Notebook, NotebookActions } from '@jupyterlab/notebook';

import { ITranslator } from '@jupyterlab/translation';

import { toArray } from '@lumino/algorithm';

import React, { useState } from 'react';

const isTrusted = (notebook: Notebook): boolean => {
  const model = notebook.model;
  if (!model) {
    return false;
  }
  const cells = toArray(model.cells);

  const trusted = cells.reduce((accum, current) => {
    if (current.trusted) {
      return accum + 1;
    } else {
      return accum;
    }
  }, 0);

  const total = cells.length;
  return trusted === total;
};

const TrustedButton = ({
  notebook,
  translator
}: {
  notebook: Notebook;
  translator: ITranslator;
}): JSX.Element => {
  const trans = translator.load('retrolab');
  const [trusted, setTrusted] = useState(isTrusted(notebook));

  const trust = async () => {
    await NotebookActions.trust(notebook, translator);
    const v = isTrusted(notebook);
    setTrusted(v);
  };

  return (
    <button
      className={'jp-RetroTrustedStatus'}
      style={!trusted ? { cursor: 'pointer' } : { cursor: 'help' }}
      onClick={() => !trusted && trust()}
      title={
        trusted
          ? trans.__('JavaScript enabled for notebook display')
          : trans.__('JavaScript disabled for notebook display')
      }
    >
      {trusted ? trans.__('Trusted') : trans.__('Not Trusted')}
    </button>
  );
};

/**
 * A namespace for TrustedComponent statics.
 */
export namespace TrustedComponent {
  /**
   * Create a new TrustedComponent
   *
   * @param notebook The notebook
   * @param translator The translator
   */
  export const create = ({
    notebook,
    translator
  }: {
    notebook: Notebook;
    translator: ITranslator;
  }): ReactWidget => {
    return ReactWidget.create(
      <TrustedButton notebook={notebook} translator={translator} />
    );
  };
}
