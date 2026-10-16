import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { Memento, config, ui } from './vscodeStub';
import { activate } from '../src/extension';

test('status bar button opens the preview and follows its setting', () => {
  const context = { globalState: new Memento(), subscriptions: [] as unknown[], extensionUri: { fsPath: '/ext' } };
  activate(context as any);

  assert.equal(ui.statusItems.length, 1);
  const item = ui.statusItems[0];
  assert.equal(item.command, 'fontPreview.open');
  assert.ok(ui.commands.has(item.command!), 'the command it runs is registered');
  assert.match(item.text, /^\$\([\w-]+\) Fonts$/);
  assert.equal(item.visible, true, 'shown by default');
  assert.ok(context.subscriptions.includes(item), 'disposed with the extension');

  const change = (key: string) => ui.configListeners.forEach((fn) => fn({ affectsConfiguration: (k) => k === key }));
  config.showStatusBarItem = false;
  change('fontPreview.showStatusBarItem');
  assert.equal(item.visible, false);
  config.showStatusBarItem = true;
  change('fontPreview.showStatusBarItem');
  assert.equal(item.visible, true);
});
