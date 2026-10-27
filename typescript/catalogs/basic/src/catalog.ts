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

import {zod4CatalogSchemaAdapter} from '@a2ui/schema-zod-v4';
import {Catalog} from '@a2ui/web_core_v1_0';
import {BasicCatalogThemeSchema} from './theme.js';
import type {WebComponentImplementation} from '@a2ui/web_core_v1_0';
import BASIC_CATALOG_DOCUMENT from './catalog.json' with {type: 'json'};
import {
  A2uiAudioPlayer,
  A2uiButton,
  A2uiCard,
  A2uiCheckBox,
  A2uiChoicePicker,
  A2uiColumn,
  A2uiDateTimeInput,
  A2uiDivider,
  A2uiIcon,
  A2uiImage,
  A2uiList,
  A2uiModal,
  A2uiRow,
  A2uiSlider,
  A2uiTabs,
  A2uiText,
  A2uiTextField,
  A2uiVideo,
} from './components/index.js';
import {BASIC_FUNCTIONS} from './functions/basic_functions.js';

/**
 * The v1 basic catalog of A2UI components implemented via Web Components
 * (Custom Elements).
 *
 * Its components and functions are the Zod 4 models generated from the
 * published catalog document (see scripts/generate-catalog-schemas.mjs),
 * listed in the document's order. The catalog carries that document, a copy
 * of catalogs/basic/v1/catalog.json, so `toJson` returns it. The Zod 4 schema
 * adapter does not generate JSON Schema yet, so `validationSchema` is not
 * available.
 */
export const basicCatalog = new Catalog<WebComponentImplementation>(
  'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json',
  '1.0',
  [
    A2uiText,
    A2uiImage,
    A2uiIcon,
    A2uiVideo,
    A2uiAudioPlayer,
    A2uiRow,
    A2uiColumn,
    A2uiList,
    A2uiCard,
    A2uiTabs,
    A2uiModal,
    A2uiDivider,
    A2uiButton,
    A2uiTextField,
    A2uiCheckBox,
    A2uiChoicePicker,
    A2uiSlider,
    A2uiDateTimeInput,
  ],
  BASIC_FUNCTIONS,
  {
    themeSchema: BasicCatalogThemeSchema,
    schemaAdapter: zod4CatalogSchemaAdapter,
    document: BASIC_CATALOG_DOCUMENT,
    schemaUri: BASIC_CATALOG_DOCUMENT.$schema,
    schemaId: BASIC_CATALOG_DOCUMENT.$id,
    title: BASIC_CATALOG_DOCUMENT.title,
    description: BASIC_CATALOG_DOCUMENT.description,
    instructions: BASIC_CATALOG_DOCUMENT.instructions,
    declaredProtocolVersion: BASIC_CATALOG_DOCUMENT.protocolVersion,
  },
);
