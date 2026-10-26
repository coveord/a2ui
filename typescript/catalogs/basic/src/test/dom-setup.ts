/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {JSDOM} from 'jsdom';

let dom: JSDOM | null = null;
const originalGlobals: Record<string, unknown> = {};

function applyGlobals(values: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete (globalThis as Record<string, unknown>)[key];
    } else {
      (globalThis as Record<string, unknown>)[key] = value;
    }
  }
}

export function setupTestDom(): void {
  if (!dom) {
    dom = new JSDOM('<!DOCTYPE html><body></body>');
    for (const name of [
      'window',
      'document',
      'Document',
      'HTMLElement',
      'customElements',
      'Element',
      'Node',
      'Event',
      'MutationObserver',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'CSSStyleSheet',
      'ShadowRoot',
    ]) {
      originalGlobals[name] = (globalThis as Record<string, unknown>)[name];
    }
  } else {
    dom.window.document.body.innerHTML = '';
  }

  if (!dom.window.document.adoptedStyleSheets) {
    dom.window.document.adoptedStyleSheets = [];
  }
  if (dom.window.CSSStyleSheet && !dom.window.CSSStyleSheet.prototype.replaceSync) {
    dom.window.CSSStyleSheet.prototype.replaceSync = function (text: string): void {
      const stylesheet = this as CSSStyleSheet & {_styleElement?: HTMLStyleElement};
      stylesheet._styleElement ??= dom!.window.document.createElement('style');
      dom!.window.document.head.appendChild(stylesheet._styleElement);
      stylesheet._styleElement.textContent = text;
    };
  }

  applyGlobals({
    window: dom.window,
    document: dom.window.document,
    Document: dom.window.Document,
    HTMLElement: dom.window.HTMLElement,
    customElements: dom.window.customElements,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MutationObserver: dom.window.MutationObserver,
    CSSStyleSheet: dom.window.CSSStyleSheet,
    ShadowRoot: dom.window.ShadowRoot,
    requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 16),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  });
}

setupTestDom();

export function teardownTestDom(): void {
  dom?.window.document.body.replaceChildren();
  applyGlobals(originalGlobals);
  dom = null;
}

export async function asyncUpdate<T>(
  target: T,
  update?: (element: T) => void | Promise<void>,
): Promise<void> {
  await update?.(target);
  const element = target as T & {updateComplete?: Promise<unknown>};
  if (element.updateComplete) {
    await element.updateComplete;
  } else {
    await new Promise(resolve => setTimeout(resolve));
  }
}
