/*
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {z} from 'zod/v4';

import {ComponentCommonSchema} from './common-types.js';

/**
 * Zod 4 copies of the `../schema/helpers.js` schemas that the generated v1.0
 * message schemas build on.
 */

export const AnyComponentSchema: z.ZodType<any> = z.lazy(() =>
  ComponentCommonSchema.extend({
    component: z.string(),
  })
    .passthrough()
    .refine(comp => comp.component !== 'Surface', {
      message:
        'Component type cannot be "Surface". "Surface" is a top-level protocol container defined in createSurface, not a child component.',
    }),
);

export const ComponentsListSchema = z.array(AnyComponentSchema).min(1);
