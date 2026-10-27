/*
 * Copyright 2026 Google LLC
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
 * Transitional support for catalog entries written with Zod 3.
 *
 * @deprecated `fromZod3` lets a Zod 3 schema stand in where A2UI takes an
 * `A2uiSchema`, until catalogs move to a library that implements Standard
 * JSON Schema itself, such as Zod 4.
 */

export {fromZod3} from './from_zod3.js';
