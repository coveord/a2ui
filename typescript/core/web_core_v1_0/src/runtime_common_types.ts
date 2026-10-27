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

// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from specification/v1_0 via scripts/generate-runtime-common-types.mjs

/**
 * The v1.0 common type definitions as a renderer accepts them: a superset of
 * `V10_STANDARD_DEFS` that also accepts the pre-v1.0 `path` and `call`
 * spellings and a call to any function, and reads a union as matching any of
 * its branches. Schema adapters that load catalog documents validate against
 * these definitions; `validationSchema` keeps the specification's.
 */
export const V10_RUNTIME_COMMON_TYPE_DEFS: Record<string, unknown> = {
  'ComponentId': {
    'type': 'string',
    'description':
      'The unique identifier for a component, used for both definitions and references within the same surface.',
  },
  'CallId': {
    'type': 'string',
    'description': 'The unique identifier for a function call.',
  },
  'AccessibilityAttributes': {
    'type': 'object',
    'description':
      'Attributes to enhance accessibility when using assistive technologies like screen readers or model understanding.',
    'properties': {
      'label': {
        '$ref': '#/$defs/DynamicString',
        'description':
          "A short string, typically 1 to 3 words, used by assistive technologies to convey the purpose or intent of an element. For example, an input field might have an accessible label of 'User ID' or a button might be labeled 'Submit'.",
      },
      'description': {
        '$ref': '#/$defs/DynamicString',
        'description':
          "Additional information provided by assistive technologies about an element such as instructions, format requirements, or result of an action. For example, a mute button might have a label of 'Mute' and a description of 'Silences notifications about this conversation'.",
      },
      'live': {
        'type': 'string',
        'description':
          "Controls screen reader announcements for dynamic updates (WAI-ARIA aria-live). 'polite' waits for user pause; 'assertive' interrupts immediately for alerts.",
        'enum': ['off', 'polite', 'assertive'],
        'default': 'off',
      },
      'hidden': {
        '$ref': '#/$defs/DynamicBoolean',
        'description':
          'Hides the element and its children from assistive technologies when true. Default is false.',
      },
    },
    'additionalProperties': false,
  },
  'Extensions': {
    'type': 'object',
    'description':
      "Optional extension metadata. Keys MUST be Unicode identifiers (UAX #31). Keys starting with 'a2ui_' are reserved for official extensions.",
    'patternProperties': {
      '^[\\p{XID_Start}_][\\p{XID_Continue}]*$': {},
    },
    'additionalProperties': false,
  },
  'ComponentCommon': {
    'type': 'object',
    'properties': {
      'id': {
        '$ref': '#/$defs/ComponentId',
      },
      'catalogId': {
        'type': 'string',
        'description':
          'The catalog ID for this component, overriding any surface-level default catalogId.',
      },
      'accessibility': {
        '$ref': '#/$defs/AccessibilityAttributes',
      },
      'metadata': {
        'type': 'object',
        'description': 'Optional component-level metadata for vendor extensions.',
        'properties': {
          'extensions': {
            '$ref': '#/$defs/Extensions',
          },
        },
        'additionalProperties': false,
      },
    },
    'required': ['id'],
  },
  'Child': {
    '$ref': '#/$defs/ComponentId',
    'description': 'A reference to a single child component ID.',
  },
  'ChildList': {
    'anyOf': [
      {
        'type': 'array',
        'description': 'A static list of child component IDs.',
        'items': {
          '$ref': '#/$defs/ComponentId',
        },
      },
      {
        'type': 'object',
        'description':
          'A template for generating a dynamic list of children from a data model list. The `componentId` is the component to use as a template.',
        'properties': {
          'componentId': {
            '$ref': '#/$defs/ComponentId',
          },
          'path': {
            'type': 'string',
            'description': 'The path to the list of component property objects in the data model.',
          },
        },
        'required': ['componentId', 'path'],
      },
    ],
  },
  'DataBinding': {
    'type': 'object',
    'properties': {
      'path': {
        'type': 'string',
        'description': 'A JSON Pointer path to a value in the data model.',
      },
      '@path': {
        'type': 'string',
        'description': 'A JSON Pointer path to a value in the data model.',
      },
    },
    'anyOf': [
      {
        'required': ['@path'],
      },
      {
        'required': ['path'],
      },
    ],
  },
  'DynamicValue': {
    'description': 'A value that can be a literal, a path, or a function call returning any type.',
    'anyOf': [
      {
        'type': 'string',
      },
      {
        'type': 'number',
      },
      {
        'type': 'boolean',
      },
      {
        'type': 'array',
      },
      {
        'type': 'object',
        'not': {
          'anyOf': [
            {
              'required': ['@path'],
            },
            {
              'required': ['path'],
            },
            {
              'required': ['@call'],
            },
            {
              'required': ['call'],
            },
          ],
        },
      },
      {
        '$ref': '#/$defs/DataBinding',
      },
      {
        '$ref': '#/$defs/FunctionCall',
      },
    ],
  },
  'DynamicString': {
    'description': 'Represents a string',
    'anyOf': [
      {
        'type': 'string',
      },
      {
        '$ref': '#/$defs/DataBinding',
      },
      {
        '$ref': '#/$defs/FunctionCall',
      },
    ],
  },
  'DynamicNumber': {
    'description':
      'Represents a value that can be either a literal number, a path to a number in the data model, or a function call returning a number.',
    'anyOf': [
      {
        'type': 'number',
      },
      {
        '$ref': '#/$defs/DataBinding',
      },
      {
        '$ref': '#/$defs/FunctionCall',
      },
    ],
  },
  'DynamicBoolean': {
    'description':
      "A boolean value that can be a literal, a path, or a function call returning a boolean or a validation result object (coerced to its 'valid' boolean).",
    'anyOf': [
      {
        'type': 'boolean',
      },
      {
        '$ref': '#/$defs/DataBinding',
      },
      {
        '$ref': '#/$defs/FunctionCall',
      },
    ],
  },
  'DynamicStringList': {
    'description':
      'Represents a value that can be either a literal array of strings, a path to a string array in the data model, or a function call returning a string array.',
    'anyOf': [
      {
        'type': 'array',
        'items': {
          'type': 'string',
        },
      },
      {
        '$ref': '#/$defs/DataBinding',
      },
      {
        '$ref': '#/$defs/FunctionCall',
      },
    ],
  },
  'FunctionCommon': {
    'type': 'object',
    'properties': {
      'call': {
        'type': 'string',
        'description': 'The name of the function to call.',
      },
      '@call': {
        'type': 'string',
        'description': 'The name of the function to call.',
      },
      'catalogId': {
        'type': 'string',
        'description':
          'The catalog ID for this function, overriding any surface-level default catalogId.',
      },
    },
    'anyOf': [
      {
        'required': ['@call'],
      },
      {
        'required': ['call'],
      },
    ],
    'description':
      "Baseline envelope properties common to all function calls. Function-specific argument schemas ('args') are defined individually by each function in the active catalog.",
  },
  'IndexSystemFunction': {
    'type': 'object',
    'properties': {
      'call': {
        'const': '@index',
      },
      '@call': {
        'const': '@index',
      },
      'args': {
        'type': 'object',
        'properties': {
          'offset': {
            '$ref': '#/$defs/DynamicNumber',
          },
        },
      },
    },
    'anyOf': [
      {
        'required': ['@call'],
      },
      {
        'required': ['call'],
      },
    ],
    'description':
      'Returns the 0-based index of the current item when rendering a dynamic list from a template. This function MUST ONLY be available when evaluating template items within a list context.',
  },
  'FunctionCall': {
    'type': 'object',
    'properties': {
      'call': {
        'type': 'string',
        'description': 'The name of the function to call.',
      },
      '@call': {
        'type': 'string',
        'description': 'The name of the function to call.',
      },
      'args': {
        'type': 'object',
        'description': 'Arguments passed to the function.',
      },
      'returnType': {
        'enum': ['string', 'number', 'boolean', 'array', 'object', 'any', 'void'],
        'description': 'The expected return type of the function call.',
      },
      'catalogId': {
        'type': 'string',
        'description':
          'The catalog ID for this function, overriding any surface-level default catalogId.',
      },
    },
    'additionalProperties': false,
    'anyOf': [
      {
        'required': ['@call'],
      },
      {
        'required': ['call'],
      },
    ],
    'description':
      'Invokes a named function, combining common function properties with the catalog function definition.',
  },
  'CheckRule': {
    'type': 'object',
    'description':
      'A single validation check rule applied to an input component. The condition function or path evaluates to a structured validation result object or a boolean (which is coerced to a validation result object).',
    'properties': {
      'condition': {
        'description':
          'Path or function call evaluating to a structured validation result object or a boolean.',
        'anyOf': [
          {
            '$ref': '#/$defs/DataBinding',
          },
          {
            '$ref': '#/$defs/FunctionCall',
          },
        ],
      },
      'message': {
        'type': 'string',
        'description': 'Optional fallback error message.',
      },
    },
    'required': ['condition'],
    'additionalProperties': false,
  },
  'Checkable': {
    'type': 'object',
    'description': 'Properties for components that support renderer-side checks.',
    'properties': {
      'checks': {
        'type': 'array',
        'description': 'A list of validation check rules to perform on the component.',
        'items': {
          '$ref': '#/$defs/CheckRule',
        },
      },
    },
  },
  'Action': {
    'description':
      'Defines an interaction handler that can either trigger an agent-side event or execute a local renderer-side function.',
    'anyOf': [
      {
        'type': 'object',
        'description': 'Triggers an agent-side event.',
        'properties': {
          'event': {
            'type': 'object',
            'description': 'The event to dispatch to the agent.',
            'properties': {
              'name': {
                'type': 'string',
                'description': 'The name of the action to be dispatched to the agent.',
              },
              'userMessage': {
                '$ref': '#/$defs/DynamicString',
                'description':
                  'An optional human-readable message describing the action performed by the user, resolved by the renderer and included in the outbound action message.',
              },
              'context': {
                'type': 'object',
                'description':
                  'A JSON object containing the key-value pairs for the action context. Values can be literals or paths. Use literal values unless the value must be dynamically bound to the data model. Do NOT use paths for static IDs.',
                'additionalProperties': {
                  '$ref': '#/$defs/DynamicValue',
                },
              },
            },
            'required': ['name'],
            'additionalProperties': false,
          },
        },
        'required': ['event'],
        'additionalProperties': false,
      },
      {
        'type': 'object',
        'description': 'Executes a renderer or agent-side function.',
        'properties': {
          'functionCall': {
            '$ref': '#/$defs/FunctionCall',
          },
        },
        'required': ['functionCall'],
        'additionalProperties': false,
      },
    ],
  },
  'Surface': {
    'title': 'Surface Container Component',
    'description':
      "The reserved canonical container component representing an A2UI surface. The Surface component is immutable and always has 'child': 'root'.",
    'type': 'object',
    'allowedParents': [],
    'properties': {
      'component': {
        'const': 'Surface',
      },
      'child': {
        'const': 'root',
      },
    },
    'additionalProperties': false,
  },
  'FunctionResponse': {
    'type': 'object',
    'description':
      'The return response matching a callAgentFunction or callRendererFunction invocation.',
    'properties': {
      'functionCallId': {
        '$ref': '#/$defs/CallId',
        'description': 'The unique ID matching the initiating function call.',
      },
      'value': {
        'description': 'The return value of the function.',
      },
      'error': {
        'type': 'object',
        'description': 'An error object indicating failure of the function execution.',
        'properties': {
          'code': {
            'type': 'string',
          },
          'message': {
            'type': 'string',
          },
        },
        'required': ['code', 'message'],
        'additionalProperties': false,
      },
    },
    'required': ['functionCallId'],
    'anyOf': [
      {
        'required': ['value'],
      },
      {
        'required': ['error'],
      },
    ],
    'additionalProperties': false,
  },
};
