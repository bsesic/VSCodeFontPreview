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

test('Preview Font Under Cursor opens the panel and sends the family once the webview is ready', async () => {
  const { editor } = await import('./vscodeStub');
  editor.open = true;
  editor.text = 'h1 { font-family: "Playfair Display", serif; }';
  editor.selections = [[22, 22]];
  await ui.commands.get('fontPreview.previewFontAtCursor')!();
  const view = ui.panels.at(-1)!;
  assert.ok(!view.posted.some((m) => m.type === 'command'), 'held back until the webview is ready');
  await view.send({ type: 'ready' });
  assert.deepEqual(view.posted.at(-1), { type: 'command', command: 'inspectFamily', family: 'Playfair Display' });

  // The panel is ready now, so the next command is sent right away.
  await ui.commands.get('fontPreview.insertIcon')!();
  assert.deepEqual(view.posted.at(-1), { type: 'command', command: 'showIcons' });
  assert.equal(ui.panels.length, 1, 'the panel is reused');
});
