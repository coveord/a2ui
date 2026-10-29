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

// AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
// Generated from specification/ catalogs via scripts/generate-catalog-schemas.mjs
import {z} from 'zod/v4';

import {specMeta} from '../../../catalog/spec_annotations.js';
import {CatalogDocumentOptions, ComponentApi} from '../../../catalog/types.js';
import {
  AccessibilityAttributesSchema,
  ActionSchema,
  CheckRuleSchema,
  ChildListSchema,
  ComponentIdSchema,
  DataBindingSchema,
  DynamicBooleanSchema,
  DynamicNumberSchema,
  DynamicStringListSchema,
  DynamicStringSchema,
} from '../../schema/common-types.js';

export const CatalogComponentCommonSchema = z
  .object({
    'weight': z
      .number()
      .describe(
        "The relative weight of this component within a Row or Column. This is similar to the CSS 'flex-grow' property. Note: this may ONLY be set when the component is a direct descendant of a Row or Column.",
      )
      .optional(),
  })
  .meta(specMeta({defName: 'CatalogComponentCommon'}));

export const ThemeDefSchema = z
  .object({
    'primaryColor': z
      .string()
      .regex(new RegExp('^#[0-9a-fA-F]{6}$'))
      .describe(
        "The primary brand color used for highlights (e.g., primary buttons, active borders). Renderers may generate variants of this color for different contexts. Format: Hexadecimal code (e.g., '#00BFFF').",
      )
      .optional(),
    'iconUrl': z
      .string()
      .describe('A URL for an image that identifies the agent or tool associated with the surface.')
      .meta(specMeta({keywords: {format: 'uri'}}))
      .optional(),
    'agentDisplayName': z
      .string()
      .describe(
        'Text to be displayed next to the surface to identify the agent or tool that created it.',
      )
      .optional(),
  })
  .meta(specMeta({defName: 'theme', keywords: {additionalProperties: true}}));

export const TextApi = {
  name: 'Text',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'text': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description:
          'The text content to display. While simple Markdown formatting is supported (i.e. without HTML, images, or links), utilizing dedicated UI components is generally preferred for a richer and more structured presentation.',
      }),
      'variant': z
        .enum(['h1', 'h2', 'h3', 'h4', 'h5', 'caption', 'body'])
        .default('body')
        .describe('A hint for the base text style.')
        .optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const ImageApi = {
  name: 'Image',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'url': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The URL of the image to display.',
      }),
      'description': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'Accessibility text for the image.',
      }).optional(),
      'fit': z
        .enum(['contain', 'cover', 'fill', 'none', 'scaleDown'])
        .default('fill')
        .describe(
          "Specifies how the image should be resized to fit its container. This corresponds to the CSS 'object-fit' property.",
        )
        .optional(),
      'variant': z
        .enum(['icon', 'avatar', 'smallFeature', 'mediumFeature', 'largeFeature', 'header'])
        .default('mediumFeature')
        .describe('A hint for the image size and style.')
        .optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const IconApi = {
  name: 'Icon',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'name': z
        .union([
          z.enum([
            'accountCircle',
            'add',
            'arrowBack',
            'arrowForward',
            'attachFile',
            'calendarToday',
            'call',
            'camera',
            'check',
            'close',
            'delete',
            'download',
            'edit',
            'event',
            'error',
            'fastForward',
            'favorite',
            'favoriteOff',
            'folder',
            'help',
            'home',
            'info',
            'locationOn',
            'lock',
            'lockOpen',
            'mail',
            'menu',
            'moreVert',
            'moreHoriz',
            'notificationsOff',
            'notifications',
            'pause',
            'payment',
            'person',
            'phone',
            'photo',
            'play',
            'print',
            'refresh',
            'rewind',
            'search',
            'send',
            'settings',
            'share',
            'shoppingCart',
            'skipNext',
            'skipPrevious',
            'star',
            'starHalf',
            'starOff',
            'stop',
            'upload',
            'visibility',
            'visibilityOff',
            'volumeDown',
            'volumeMute',
            'volumeOff',
            'volumeUp',
            'warning',
          ]),
          z
            .object({
              'svgPath': z.string(),
            })
            .meta(specMeta({closure: 'additionalProperties'})),
          DataBindingSchema.meta({$ref: '#/$defs/DataBinding', description: undefined}),
        ])
        .describe('The name of the icon to display.'),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const VideoApi = {
  name: 'Video',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'url': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The URL of the video to display.',
      }),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const AudioPlayerApi = {
  name: 'AudioPlayer',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'url': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The URL of the audio to be played.',
      }),
      'description': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'A description of the audio, such as a title or summary.',
      }).optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const RowApi = {
  name: 'Row',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'children': ChildListSchema.meta({
        $ref: '#/$defs/ChildList',
        description:
          'Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.',
      }),
      'justify': z
        .enum(['center', 'end', 'spaceAround', 'spaceBetween', 'spaceEvenly', 'start', 'stretch'])
        .default('start')
        .describe(
          "Defines the arrangement of children along the main axis (horizontally). Use 'spaceBetween' to push items to the edges, or 'start'/'end'/'center' to pack them together.",
        )
        .optional(),
      'align': z
        .enum(['start', 'center', 'end', 'stretch'])
        .default('stretch')
        .describe(
          "Defines the alignment of children along the cross axis (vertically). This is similar to the CSS 'align-items' property, but uses camelCase values (e.g., 'start').",
        )
        .optional(),
    })
    .describe(
      'A layout component that arranges its children horizontally. To create a grid layout, nest Columns within this Row.',
    )
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const ColumnApi = {
  name: 'Column',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'children': ChildListSchema.meta({
        $ref: '#/$defs/ChildList',
        description:
          'Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list. Children cannot be defined inline, they must be referred to by ID.',
      }),
      'justify': z
        .enum(['start', 'center', 'end', 'spaceBetween', 'spaceAround', 'spaceEvenly', 'stretch'])
        .default('start')
        .describe(
          "Defines the arrangement of children along the main axis (vertically). Use 'spaceBetween' to push items to the edges (e.g. header at top, footer at bottom), or 'start'/'end'/'center' to pack them together.",
        )
        .optional(),
      'align': z
        .enum(['center', 'end', 'start', 'stretch'])
        .default('stretch')
        .describe(
          "Defines the alignment of children along the cross axis (horizontally). This is similar to the CSS 'align-items' property.",
        )
        .optional(),
    })
    .describe(
      'A layout component that arranges its children vertically. To create a grid layout, nest Rows within this Column.',
    )
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const ListApi = {
  name: 'List',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'children': ChildListSchema.meta({
        $ref: '#/$defs/ChildList',
        description:
          'Defines the children. Use an array of strings for a fixed set of children, or a template object to generate children from a data list.',
      }),
      'direction': z
        .enum(['vertical', 'horizontal'])
        .default('vertical')
        .describe('The direction in which the list items are laid out.')
        .optional(),
      'align': z
        .enum(['start', 'center', 'end', 'stretch'])
        .default('stretch')
        .describe('Defines the alignment of children along the cross axis.')
        .optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const CardApi = {
  name: 'Card',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'child': ComponentIdSchema.meta({
        $ref: '#/$defs/ComponentId',
        description:
          "The ID of the single child component to be rendered inside the card. To display multiple elements, you MUST wrap them in a layout component (like Column or Row) and pass that container's ID here. Do NOT pass multiple IDs or a non-existent ID.",
      }),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const TabsApi = {
  name: 'Tabs',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'tabs': z
        .array(
          z
            .object({
              'title': DynamicStringSchema.meta({
                $ref: '#/$defs/DynamicString',
                description: 'The tab title.',
              }),
              'child': ComponentIdSchema.meta({
                $ref: '#/$defs/ComponentId',
                description: 'The ID of the child component.',
              }),
            })
            .meta(specMeta({closure: 'additionalProperties'})),
        )
        .min(1)
        .describe(
          'An array of objects, where each object defines a tab with a title and a child component.',
        ),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const ModalApi = {
  name: 'Modal',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'trigger': ComponentIdSchema.meta({
        $ref: '#/$defs/ComponentId',
        description:
          'The ID of the component that opens the modal when interacted with (e.g., a button).',
      }),
      'content': ComponentIdSchema.meta({
        $ref: '#/$defs/ComponentId',
        description: 'The ID of the component to be displayed inside the modal.',
      }),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const DividerApi = {
  name: 'Divider',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'axis': z
        .enum(['horizontal', 'vertical'])
        .default('horizontal')
        .describe('The orientation of the divider.')
        .optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema]})),
} satisfies ComponentApi;

export const ButtonApi = {
  name: 'Button',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'child': ComponentIdSchema.meta({
        $ref: '#/$defs/ComponentId',
        description:
          "The ID of the child component. Use a 'Text' component for a labeled button. Only use an 'Icon' if the requirements explicitly ask for an icon-only button.",
      }),
      'variant': z
        .enum(['default', 'primary', 'borderless'])
        .default('default')
        .describe(
          "A hint for the button style. If omitted, a default button style is used. 'primary' indicates this is the main call-to-action button. 'borderless' means the button has no visual border or background, making its child content appear like a clickable link.",
        )
        .optional(),
      'action': ActionSchema.meta({$ref: '#/$defs/Action', description: undefined}),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable']})),
} satisfies ComponentApi;

export const TextFieldApi = {
  name: 'TextField',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'label': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The text label for the input field.',
      }),
      'value': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The value of the text field.',
      }).optional(),
      'variant': z
        .enum(['longText', 'number', 'shortText', 'obscured'])
        .default('shortText')
        .describe('The type of input field to display.')
        .optional(),
      'validationRegexp': z
        .string()
        .describe('A regular expression used for client-side validation of the input.')
        .optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable']})),
} satisfies ComponentApi;

export const CheckBoxApi = {
  name: 'CheckBox',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'label': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The text to display next to the checkbox.',
      }),
      'value': DynamicBooleanSchema.meta({
        $ref: '#/$defs/DynamicBoolean',
        description: 'The current state of the checkbox (true for checked, false for unchecked).',
      }),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable']})),
} satisfies ComponentApi;

export const ChoicePickerApi = {
  name: 'ChoicePicker',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'label': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The label for the group of options.',
      }).optional(),
      'variant': z
        .enum(['multipleSelection', 'mutuallyExclusive'])
        .default('mutuallyExclusive')
        .describe('A hint for how the choice picker should be displayed and behave.')
        .optional(),
      'options': z
        .array(
          z
            .object({
              'label': DynamicStringSchema.meta({
                $ref: '#/$defs/DynamicString',
                description: 'The text to display for this option.',
              }),
              'value': z.string().describe('The stable value associated with this option.'),
            })
            .meta(specMeta({closure: 'additionalProperties'})),
        )
        .describe('The list of available options to choose from.'),
      'value': DynamicStringListSchema.meta({
        $ref: '#/$defs/DynamicStringList',
        description:
          'The list of currently selected values. This should be bound to a string array in the data model.',
      }),
      'displayStyle': z
        .enum(['checkbox', 'chips'])
        .default('checkbox')
        .describe('The display style of the component.')
        .optional(),
      'filterable': z
        .boolean()
        .default(false)
        .describe('If true, displays a search input to filter the options.')
        .optional(),
    })
    .describe('A component that allows selecting one or more options from a list.')
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable']})),
} satisfies ComponentApi;

export const SliderApi = {
  name: 'Slider',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'label': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The label for the slider.',
      }).optional(),
      'min': z.number().default(0).describe('The minimum value of the slider.').optional(),
      'max': z.number().describe('The maximum value of the slider.'),
      'value': DynamicNumberSchema.meta({
        $ref: '#/$defs/DynamicNumber',
        description: 'The current value of the slider.',
      }),
    })
    .meta(
      specMeta({
        mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable'],
        required: ['value', 'max'],
      }),
    ),
} satisfies ComponentApi;

export const DateTimeInputApi = {
  name: 'DateTimeInput',
  schema: z
    .strictObject({
      ...CatalogComponentCommonSchema.shape,
      'accessibility': AccessibilityAttributesSchema.meta({
        $ref: '#/$defs/AccessibilityAttributes',
        description: undefined,
      }).optional(),
      'checks': z
        .array(CheckRuleSchema.meta({$ref: '#/$defs/CheckRule', description: undefined}))
        .describe(
          'A list of checks to perform. These are function calls that must return a boolean indicating validity.',
        )
        .optional(),
      'value': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description:
          'The selected date and/or time value in ISO 8601 format. If not yet set, initialize with an empty string.',
      }),
      'enableDate': z
        .boolean()
        .default(false)
        .describe('If true, allows the user to select a date.')
        .optional(),
      'enableTime': z
        .boolean()
        .default(false)
        .describe('If true, allows the user to select a time.')
        .optional(),
      'min': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The minimum allowed date/time in ISO 8601 format.',
      })
        .meta(
          specMeta({
            allOf: [
              {
                if: {type: 'string'},
                then: {oneOf: [{format: 'date'}, {format: 'time'}, {format: 'date-time'}]},
              },
            ],
          }),
        )
        .optional(),
      'max': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The maximum allowed date/time in ISO 8601 format.',
      })
        .meta(
          specMeta({
            allOf: [
              {
                if: {type: 'string'},
                then: {oneOf: [{format: 'date'}, {format: 'time'}, {format: 'date-time'}]},
              },
            ],
          }),
        )
        .optional(),
      'label': DynamicStringSchema.meta({
        $ref: '#/$defs/DynamicString',
        description: 'The text label for the input field.',
      }).optional(),
    })
    .meta(specMeta({mixins: ['ComponentCommon', CatalogComponentCommonSchema, 'Checkable']})),
} satisfies ComponentApi;

export const BASIC_COMPONENTS: ComponentApi[] = [
  TextApi,
  ImageApi,
  IconApi,
  VideoApi,
  AudioPlayerApi,
  RowApi,
  ColumnApi,
  ListApi,
  CardApi,
  TabsApi,
  ModalApi,
  DividerApi,
  ButtonApi,
  TextFieldApi,
  CheckBoxApi,
  ChoicePickerApi,
  SliderApi,
  DateTimeInputApi,
];

/**
 * The document-level fields of the published catalog document.
 */
export const BASIC_CATALOG_DOCUMENT_OPTIONS = {
  schemaUri: 'https://json-schema.org/draft/2020-12/schema',
  schemaId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
  title: 'A2UI Basic Catalog',
  description: 'Unified catalog of basic A2UI components and functions.',
  declaredProtocolVersion: null,
  commonTypesUri: 'https://a2ui.org/specification/v0_9/common_types.json',
  defModels: [ThemeDefSchema],
} satisfies CatalogDocumentOptions;
