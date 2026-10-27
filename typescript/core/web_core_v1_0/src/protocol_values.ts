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

/** Identifier of a component in an A2UI surface. */
export type ComponentId = string;

/** A dynamic data-model binding. */
export interface DataBinding {
  readonly '@path'?: string;
  readonly path?: string;
}

/** A deferred catalog function invocation. */
export interface FunctionCall {
  readonly '@call'?: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly call?: string;
  readonly catalogId?: string;
  readonly returnType?: string;
}

/** A component child-list literal or dynamic template. */
export type ChildList = readonly ComponentId[] | {readonly componentId: ComponentId; readonly path: string};

/** A value that may be literal, bound to data, or produced by a function. */
export type DynamicValue =
  | string
  | number
  | boolean
  | null
  | readonly unknown[]
  | Readonly<Record<string, unknown>>
  | DataBinding
  | FunctionCall;

/** A user interaction sent to an agent or executed as a local function. */
export type Action =
  | {
      readonly event: {
        readonly context?: Readonly<Record<string, unknown>>;
        readonly name: string;
        readonly userMessage?: DynamicValue;
      };
    }
  | {readonly functionCall: FunctionCall};
