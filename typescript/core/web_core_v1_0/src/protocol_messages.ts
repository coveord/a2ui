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

import type {FunctionCall} from './protocol_values.js';

/** A protocol response that completes a renderer or agent function call. */
export interface FunctionResponseMessage {
  readonly error?: {readonly code: string; readonly message: string};
  readonly functionCallId: string;
  readonly value?: unknown;
}

/** Agent request for the renderer to execute a catalog function. */
export interface CallRendererFunctionMessage {
  readonly callRendererFunction: {
    readonly callFunction: FunctionCall;
    readonly functionCallId: string;
    readonly surfaceId?: string;
  };
  readonly version: string;
}

/** Agent response completing a renderer-originated function call. */
export interface AgentFunctionResponseMessage {
  readonly agentFunctionResponse: FunctionResponseMessage;
  readonly version: string;
}

/** Renderer request for the agent to execute a catalog function. */
export interface CallAgentFunctionMessage {
  readonly callAgentFunction: {
    readonly callFunction: FunctionCall;
    readonly functionCallId: string;
    readonly surfaceId: string;
  };
  readonly version: string;
}

/** Renderer response completing an agent-originated function call. */
export interface RendererFunctionResponseMessage {
  readonly rendererFunctionResponse: FunctionResponseMessage;
  readonly version: string;
}

/** A versioned agent-to-renderer protocol message. */
export type AgentToRendererMessage = Readonly<Record<string, unknown>>;

/** Renderer capabilities keyed by supported protocol version. */
export type RendererCapabilities = Readonly<Record<string, unknown>>;
