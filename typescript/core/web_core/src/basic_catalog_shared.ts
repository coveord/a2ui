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

/**
 * @fileoverview Building blocks of the basic catalog that do not depend on a
 * protocol version: the custom elements, theme, styles, markdown support and
 * function factories.
 *
 * The v0.9 basic catalog in this package and the v1 basic catalog in
 * `@a2ui/catalog-basic` both assemble their catalogs from these. They stay in
 * `@a2ui/web_core` until the v0.9 basic catalog moves out as well.
 */

export {
  A2uiAudioPlayerElement,
  A2uiBasicButtonElement,
  A2uiBasicColumnElement,
  A2uiBasicRowElement,
  A2uiBasicTextElement,
  A2uiBasicTextFieldElement,
  A2uiCardElement,
  A2uiCheckBoxElement,
  A2uiChoicePickerElement,
  A2uiDateTimeInputElement,
  A2uiDividerElement,
  A2uiIconElement,
  A2uiImageElement,
  A2uiListElement,
  A2uiModalElement,
  A2uiSliderElement,
  A2uiTabsElement,
  A2uiVideoElement,
} from './universal/basic_catalog/components/index.js';
export {Context} from './universal/basic_catalog/context/context.js';
export {
  getMarkdownRenderer,
  markdown,
  setMarkdownRenderer,
} from './universal/basic_catalog/directives/directives.js';
export {
  computeColorVariant,
  injectBasicCatalogStyles,
  type ColorVariantHoverOptions,
  type ColorVariantLightDarkOptions,
} from './universal/basic_catalog/styles/default.js';
export {
  BasicCatalogThemeSchema,
  isValidCssColor,
  type BasicCatalogTheme,
} from './universal/basic_catalog/theme.js';
export {
  createAndImplementation,
  createFormatCurrencyImplementation,
  createFormatDateImplementation,
  createFormatNumberImplementation,
  createFormatStringImplementation,
  createNotImplementation,
  createOpenUrlImplementation,
  createOrImplementation,
  createPluralizeImplementation,
  isTruthyOrValid,
  validateEmail,
  validateLength,
  validateNumeric,
  validateRegex,
  validateRequired,
} from './common/basic_functions.js';
